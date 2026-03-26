import type { InstantRules } from './queryTypes.ts';

type Operation = 'view' | 'create' | 'update' | 'delete';

export type CapabilitiesResult = {
  allowed: boolean;
  reason?: string;
};

export type CapabilityCheckParams = {
  rules: InstantRules | undefined;
  namespace: string;
  operation: Operation;
  userId: string | null;
  roles?: string[];
};

type RuleCheck = {
  allow: Record<string, boolean>;
} | null;

function getRuleForNamespace(
  rules: InstantRules | undefined,
  namespace: string,
): RuleCheck {
  if (!rules) return null;
  const nsRules = rules[namespace];
  if (!nsRules) return null;
  return nsRules;
}

function hasMatchingRole(
  ruleAllow: Record<string, boolean>,
  userId: string | null,
  roles: string[],
): boolean {
  if (ruleAllow['$authenticated'] && userId) {
    return true;
  }
  if (ruleAllow['$anonymous'] && !userId) {
    return true;
  }
  if (ruleAllow['$any']) {
    return true;
  }
  for (const role of roles) {
    if (ruleAllow[role]) {
      return true;
    }
  }
  return false;
}

export function checkCapability(
  params: CapabilityCheckParams,
): CapabilitiesResult {
  const { rules, namespace, operation, userId, roles = [] } = params;

  if (!rules) {
    return { allowed: true, reason: 'No rules defined' };
  }

  const nsRule = getRuleForNamespace(rules, namespace);
  if (!nsRule) {
    return { allowed: false, reason: `No rules for namespace '${namespace}'` };
  }

  const operationRule = nsRule.allow[operation];
  if (operationRule === undefined) {
    return {
      allowed: false,
      reason: `No rule for operation '${operation}' in namespace '${namespace}'`,
    };
  }

  if (typeof operationRule === 'boolean') {
    return { allowed: operationRule };
  }

  if (typeof operationRule === 'object' && operationRule !== null) {
    const matched = hasMatchingRole(
      operationRule as Record<string, boolean>,
      userId,
      roles,
    );
    return { allowed: matched };
  }

  return { allowed: false };
}

export function getCapabilities(
  rules: InstantRules | undefined,
  namespace: string,
  userId: string | null,
  roles: string[] = [],
): Record<Operation, boolean> {
  const operations: Operation[] = ['view', 'create', 'update', 'delete'];
  const capabilities: Record<Operation, boolean> = {} as Record<Operation, boolean>;

  for (const op of operations) {
    const result = checkCapability({
      rules,
      namespace,
      operation: op,
      userId,
      roles,
    });
    capabilities[op] = result.allowed;
  }

  return capabilities;
}

export function canView(
  rules: InstantRules | undefined,
  namespace: string,
  userId: string | null,
  roles: string[] = [],
): boolean {
  return checkCapability({ rules, namespace, operation: 'view', userId, roles }).allowed;
}

export function canCreate(
  rules: InstantRules | undefined,
  namespace: string,
  userId: string | null,
  roles: string[] = [],
): boolean {
  return checkCapability({ rules, namespace, operation: 'create', userId, roles }).allowed;
}

export function canUpdate(
  rules: InstantRules | undefined,
  namespace: string,
  userId: string | null,
  roles: string[] = [],
): boolean {
  return checkCapability({ rules, namespace, operation: 'update', userId, roles }).allowed;
}

export function canDelete(
  rules: InstantRules | undefined,
  namespace: string,
  userId: string | null,
  roles: string[] = [],
): boolean {
  return checkCapability({ rules, namespace, operation: 'delete', userId, roles }).allowed;
}
