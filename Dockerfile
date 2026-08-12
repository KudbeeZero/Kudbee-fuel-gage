FROM node:22-bookworm

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

EXPOSE 3000 5173

CMD ["npm","run","dev"]
