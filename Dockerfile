FROM node:18
# Install dependencies for yt-dlp and ffmpeg
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp --break-system-packages

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .

EXPOSE 10000
CMD ["npm", "start"]