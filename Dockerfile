# Build stage: install dependencies and produce the static bundle.
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Serve stage: hand the static bundle to nginx.
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
CMD ["nginx", "-g", "daemon off;"]

# Deploy to Cloud Run (public):
#   gcloud run deploy nysds-playground --source . --region us-east4 --allow-unauthenticated
#
# For a team-only deployment, replace --allow-unauthenticated with
# --no-allow-unauthenticated and put the service behind Identity-Aware
# Proxy or an internal load balancer.
