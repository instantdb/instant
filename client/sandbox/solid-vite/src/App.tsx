import { Router, Route } from '@solidjs/router';
import Home from './pages/Home';
import InfiniteScroll from './pages/InfiniteScroll';
import Streams from './pages/Streams';

export default function App() {
  return (
    <Router>
      <Route path="/" component={Home} />
      <Route path="/infinite-scroll" component={InfiniteScroll} />
      <Route path="/streams" component={Streams} />
    </Router>
  );
}
