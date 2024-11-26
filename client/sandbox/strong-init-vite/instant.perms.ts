type InstantRules = {
  [EntityName: string]: {
    allow: {
      view?: string;
      create?: string;
      update?: string;
      delete?: string;
    };
    bind?: string[];
  };
};

const rules = {
  attrs: {
    allow: {
      create: "false",
    },
    bind: ["admin", "foo", "bar", "biz"],
  },
} satisfies InstantRules;

export default rules;
