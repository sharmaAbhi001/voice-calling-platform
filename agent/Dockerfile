FROM node:22-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates python3 \
  && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
COPY shared/package.json shared/
COPY backend/package.json backend/
COPY agent/package.json agent/
COPY frontend/package.json frontend/
COPY shared ./shared
# onnxruntime-node (Silero VAD, turn detection) ships prebuilt binaries for every
# platform plus a ~300 MB CUDA provider. This image is Linux and CPU-only, so the
# rest is dead weight. The prune must happen in the same layer as the install:
# deleting files in a later RUN leaves them in the earlier layer and saves nothing.
ARG TARGETARCH
RUN set -eux; \
    npm install --workspace shared --workspace agent --include-workspace-root; \
    cd node_modules/onnxruntime-node/bin/napi-v6; \
    rm -rf darwin win32; \
    if [ "${TARGETARCH:-amd64}" = "arm64" ]; then rm -rf linux/x64; else rm -rf linux/arm64; fi; \
    rm -f linux/*/libonnxruntime_providers_cuda.so linux/*/libonnxruntime_providers_tensorrt.so; \
    npm cache clean --force

FROM base AS development
COPY agent ./agent
ENV NODE_ENV=development
# The turn-detector and VAD weights are downloaded separately from the npm package.
# Baking them into the image keeps container start instant and works offline; without
# this the worker dies at boot with "File not found in cache".
# The agent validates its environment at import, so the download runs with throwaway
# placeholders - it contacts no provider, it only fetches model files.
RUN LIVEKIT_URL=ws://placeholder \
    LIVEKIT_API_KEY=placeholder \
    LIVEKIT_API_SECRET=placeholder \
    AGENT_API_KEY=placeholder-key \
    OPENAI_API_KEY=placeholder \
    npm run download-files -w agent
CMD ["npm", "run", "dev", "-w", "agent"]

FROM base AS build
COPY agent ./agent
RUN npm run build -w agent

FROM node:22-slim AS production
WORKDIR /app
ENV NODE_ENV=production
# Required, not hygiene. @livekit/rtc-node is a Rust addon that uses rustls, which
# reads the OS trust store - unlike Node's own TLS, which has root CAs compiled into
# the binary. Without this the worker still reaches LiveKit over Node TLS and logs
# "registered worker", then every dispatched job dies inside Room.connect with
# "no native root CA certificates found": the call connects, the agent never joins
# the room, and the customer hears silence. This stage starts from a clean
# node:22-slim, so it does not inherit the certificates installed in `base`.
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/shared ./shared
COPY --from=build /app/agent/dist ./agent/dist
COPY --from=build /app/agent/package.json ./agent/package.json

# Same reasoning as the development stage: the turn-detector and VAD weights are
# fetched separately from the npm package, so bake them in. Without this the
# worker dies at boot, and pulling them on first start would cost the first call.
# The agent validates its environment at import, so the download runs with
# throwaway placeholders - it contacts no provider, it only fetches model files.
#
# Two caches, two locations, and both have to survive into the runtime user:
#   - the ONNX weights go to $HOME/.cache/huggingface/hub, so HOME is pinned
#     here because Docker does not reliably derive it from USER
#   - the tokenizer goes to transformers.js's own directory inside node_modules,
#     which is root-owned - hence downloading as root and chowning afterwards
# The tests at the end make a silent partial download fail the build instead of
# shipping an image that crash-loops on boot.
ENV HOME=/home/node
RUN set -eux; \
    LIVEKIT_URL=ws://placeholder \
    LIVEKIT_API_KEY=placeholder \
    LIVEKIT_API_SECRET=placeholder \
    AGENT_API_KEY=placeholder-key \
    OPENAI_API_KEY=placeholder \
    node agent/dist/agent.js download-files; \
    test -n "$(find /app/node_modules/@huggingface/transformers -name tokenizer.json -print -quit)"; \
    test -n "$(find /home/node/.cache -name '*.onnx' -print -quit)"; \
    chown -R node:node /home/node/.cache /app/node_modules/@huggingface

USER node
# "start" mode registers the worker with LiveKit and waits for dispatch.
CMD ["node", "agent/dist/agent.js", "start"]
