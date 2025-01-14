// Docs: https://www.instantdb.com/docs/permissions

const rules = {
  attrs: {
    allow: {
      create: "false",
    },
  },
  $default: {
    allow: {
      $default: "false",
    },
  },
};

export default rules;
