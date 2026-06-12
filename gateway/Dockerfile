# Zero-dependency Node service. Works on any container host (Fly, Railway, Cloud Run, VPS).
FROM node:20-alpine
WORKDIR /app
COPY index.js package.json ./
ENV PORT=8787
EXPOSE 8787
CMD ["node", "index.js"]
