FROM ubuntu:trusty

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get -y install nodejs npm ssh git curl nano && npm i -g n && useradd skiff -m -s /bin/bash -G sudo && echo "skiff:skiff" | chpasswd && /usr/sbin/update-rc.d ssh defaults
RUN n 6 && npm i -g npm && rm /usr/bin/npm && ln -s /usr/local/bin/npm /usr/bin/npm

COPY . /home/skiff/skiff/

EXPOSE 22
