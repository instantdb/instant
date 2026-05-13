import { createRouter, createWebHistory } from 'vue-router';
import Home from './pages/Home.vue';
import Todos from './pages/Todos.vue';
import InfiniteScroll from './pages/InfiniteScroll.vue';
import Auth from './pages/Auth.vue';
import Cursors from './pages/Cursors.vue';
import Typing from './pages/Typing.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/todos', component: Todos },
    { path: '/infinite-scroll', component: InfiniteScroll },
    { path: '/auth', component: Auth },
    { path: '/cursors', component: Cursors },
    { path: '/typing', component: Typing },
  ],
});

// Preserve `?app=<id>` across navigations. Without this, clicking a RouterLink
// (e.g. from / to /cursors) drops the query param and the destination tab
// would otherwise re-provision a fresh ephemeral app.
router.beforeEach((to) => {
  if (to.query.app) return;
  const currentApp = new URLSearchParams(window.location.search).get('app');
  if (!currentApp) return;
  return { ...to, query: { ...to.query, app: currentApp } };
});
