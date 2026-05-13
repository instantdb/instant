import { createRouter, createWebHistory } from 'vue-router';
import Home from './pages/Home.vue';
import Todos from './pages/Todos.vue';
import InfiniteScroll from './pages/InfiniteScroll.vue';
import Auth from './pages/Auth.vue';
import Cursors from './pages/Cursors.vue';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/todos', component: Todos },
    { path: '/infinite-scroll', component: InfiniteScroll },
    { path: '/auth', component: Auth },
    { path: '/cursors', component: Cursors },
  ],
});
