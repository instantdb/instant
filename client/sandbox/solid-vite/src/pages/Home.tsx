import { A } from '@solidjs/router';

export default function Home() {
  return (
    <div style={{ padding: '24px', 'font-family': 'sans-serif' }}>
      <h1 style={{ 'font-size': '24px', 'margin-bottom': '12px' }}>
        Solid + Instant Sandbox
      </h1>
      <ul>
        <li>
          <A href="/infinite-scroll">infinite-scroll</A>
        </li>
      </ul>
    </div>
  );
}
