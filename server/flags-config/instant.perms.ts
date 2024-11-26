// Docs: https://www.instantdb.com/docs/permissions

const rules = {
  attrs: {
    allow: {
      create: "false",
    },
  },
  "storage-whitelist": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "friend-emails": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "view-checks": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "power-user-emails": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "test-emails": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "promo-emails": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  hazelcast: {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "drop-refresh-spam": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  custodian: {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
  "team-emails": {
    allow: {
      view: "false",
      create: "false",
      delete: "false",
      update: "false",
    },
  },
};

export default rules;
