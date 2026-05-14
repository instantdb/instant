<script lang="ts">
  const routes = [
    { href: '/todos', label: 'todos' },
    { href: '/infinite-scroll', label: 'infinite-scroll' },
    { href: '/cursors', label: 'cursors' },
    { href: '/auth', label: 'auth' },
    { href: '/streams', label: 'streams' },
  ];
</script>

<div class="p-8">
  <h1 class="text-2xl mb-3">SvelteKit + Instant Sandbox</h1>
  <ul class="list-disc pl-6">
    {#each routes as route (route.href)}
      <li>
        <a class="underline text-blue-600" href={route.href}>{route.label}</a>
      </li>
    {/each}
  </ul>
</div>
