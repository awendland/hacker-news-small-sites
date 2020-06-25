FROM node:14-stretch

WORKDIR /app

COPY package.json ./
COPY yarn.lock ./
RUN yarn

RUN apt-get update
RUN apt-get install -y lldb-4.0 liblldb-4.0-dev
RUN yarn global add llnode
COPY ./ ./
RUN mv feeds-fresh feeds
