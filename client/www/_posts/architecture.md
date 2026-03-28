---
title: An Architecture for a Multi-Tenant Sync Engine
date: '2026-03-26'
authors: stopachka
thumbnail: /img/essays/architecture.jpg
summary: How we built a sync engine that serves millions of apps on shared infrastructure — from CRDTs and CEL permissions to IndexedDB and beyond.
isDraft: false
---

After about 4 years of hacking, we've just released Instant 1.0! If you haven't heard of us, we're a real-time backend for web and React Native apps. You can create unlimited apps, and every app you make is real-time, works offline, and comes with optimistic updates.
