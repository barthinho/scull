FROM ubuntu:trusty

RUN apt-get update && apt-get -y install nodejs npm ssh git curl && npm i -g n && n 6 && npm i -g npm && rm /usr/bin/npm && ln -s /usr/local/bin/npm /usr/bin/npm && useradd skiff -m -s /bin/bash -G sudo && echo "skiff:skiff" | chpasswd && /usr/sbin/update-rc.d ssh defaults

EXPOSE 22
