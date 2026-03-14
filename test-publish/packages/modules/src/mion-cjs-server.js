'use strict';
const http = require('@mionjs/platform-node');
const router = require('@mionjs/router');
const apps_src_models = require('./models.js');

const routes = {
  hello: router.route(() => 'world'),
  updateUser: router.route((ctx, user) => {
    user.lastUpdate.setMonth(user.lastUpdate.getMonth() + 1);
    return user;
  }),
};
const initHttp = async (routerOpts, httpOpts) => {
  await router.initMionRouter(routes, routerOpts);
  return http.startNodeServer(httpOpts);
};

initHttp({aot: false}, {port: 3000});
