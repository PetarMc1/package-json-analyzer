# package.json analyzer

A tool to analyze the size of a JavaScript/TypeScript project by examining its `package.json` dependencies and their sizes.


## Deployment

The app can run as a single Docker image with Nginx serving the frontend and proxying `/api/*` to the backend.

```bash
git clone https://github.com/PetarMc1/package-json-analyzer.git
cd package-json-analyzer
docker compose up -d
```