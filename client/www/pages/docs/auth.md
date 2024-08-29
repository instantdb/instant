---
title: Auth
---

Instant comes with support for auth. We currently offer [magic codes](/docs/auth/magic-codes) and [Google OAuth](/docs/auth/google-oauth). If you want to build your own flow, you can use the [Admin SDK](/docs/backend#custom-auth).

{% nav-group %}
  {% nav-button href="/docs/auth/magic-codes"
            title="Magic Codes"
            description="Send login codes to your users via email. Removes the need for passwords!"
            /%}
  {% nav-button href="/docs/auth/google-oauth"
            title="Google OAuth"
            description="We provide flows for Web and React Native to enable Google OAuth for your app."
            /%}
  {% nav-button href="/docs/backend#custom-auth"
            title="Custom Auth"
            description="Integrate your own auth flow with the Admin SDK."
            /%}
  {% nav-button href="https://github.com/stopachka/clerk_auth_example"
            title="Clerk (Alpha)"
            description="Github repo showing how to integrate with Clerk."
            /%}
{% /nav-group %}
