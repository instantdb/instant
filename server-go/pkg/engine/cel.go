package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

// PermissionEngine evaluates permission rules.
// Uses a simple expression evaluator compatible with InstantDB's CEL subset.
type PermissionEngine struct {
	db *storage.DB
	qe *QueryEngine
}

// NewPermissionEngine creates a new permission engine.
func NewPermissionEngine(db *storage.DB, qe *QueryEngine) (*PermissionEngine, error) {
	return &PermissionEngine{db: db, qe: qe}, nil
}

// PermContext holds the context for permission evaluation.
type PermContext struct {
	AppID     string
	UserID    string
	UserEmail string
	IsAdmin   bool
	Attrs     []*storage.Attr
	// Request context
	RequestTime   int64  // unix millis
	RequestOrigin string
	RequestIP     string
}

// CheckResult holds the result of a permission check.
type CheckResult struct {
	Allowed bool
	Error   string
}

// CheckPermission evaluates a rule expression against the given context.
func (pe *PermissionEngine) CheckPermission(_ context.Context, rule string, permCtx *PermContext, _ string, _ string, data map[string]interface{}) *CheckResult {
	if permCtx.IsAdmin {
		return &CheckResult{Allowed: true}
	}

	rule = strings.TrimSpace(rule)

	if rule == "" || rule == "true" {
		return &CheckResult{Allowed: true}
	}
	if rule == "false" {
		return &CheckResult{Allowed: false, Error: "permission denied"}
	}

	// Build context variables
	var authCtx interface{}
	if permCtx.UserID != "" {
		authCtx = map[string]interface{}{
			"id":    permCtx.UserID,
			"email": permCtx.UserEmail,
		}
	}

	requestCtx := map[string]interface{}{
		"time":   permCtx.RequestTime,
		"origin": permCtx.RequestOrigin,
		"ip":     permCtx.RequestIP,
	}

	env := map[string]interface{}{
		"auth":       authCtx,
		"data":       data,
		"newData":    data,
		"ruleParams": map[string]interface{}{},
		"request":    requestCtx,
	}

	result, err := evalExpr(rule, env)
	if err != nil {
		return &CheckResult{Allowed: false, Error: fmt.Sprintf("eval error: %v", err)}
	}

	if b, ok := result.(bool); ok {
		if b {
			return &CheckResult{Allowed: true}
		}
		return &CheckResult{Allowed: false, Error: "permission denied"}
	}

	return &CheckResult{Allowed: false, Error: "rule did not return boolean"}
}

// EvalRules evaluates all applicable rules for an entity operation.
func (pe *PermissionEngine) EvalRules(ctx context.Context, permCtx *PermContext, rules *storage.Rule, etype string, action string, data map[string]interface{}) *CheckResult {
	if permCtx.IsAdmin {
		return &CheckResult{Allowed: true}
	}

	if rules == nil {
		return &CheckResult{Allowed: true}
	}

	var ruleMap map[string]interface{}
	if err := json.Unmarshal(rules.Code, &ruleMap); err != nil {
		return &CheckResult{Allowed: true}
	}

	etypeRules, ok := ruleMap[etype]
	if !ok {
		return &CheckResult{Allowed: true}
	}

	etypeMap, ok := etypeRules.(map[string]interface{})
	if !ok {
		return &CheckResult{Allowed: true}
	}

	allowRules, ok := etypeMap["allow"]
	if !ok {
		return &CheckResult{Allowed: true}
	}

	allowMap, ok := allowRules.(map[string]interface{})
	if !ok {
		return &CheckResult{Allowed: true}
	}

	ruleExpr, ok := allowMap[action]
	if !ok {
		return &CheckResult{Allowed: true}
	}

	ruleStr, ok := ruleExpr.(string)
	if !ok {
		return &CheckResult{Allowed: true}
	}

	return pe.CheckPermission(ctx, ruleStr, permCtx, etype, action, data)
}

// EvalFieldPermissions checks field-level permissions for an entity.
// Returns the set of fields that should be hidden from the response.
func (pe *PermissionEngine) EvalFieldPermissions(ctx context.Context, permCtx *PermContext, rules *storage.Rule, etype string, data map[string]interface{}) map[string]bool {
	if permCtx.IsAdmin || rules == nil {
		return nil
	}

	var ruleMap map[string]interface{}
	if err := json.Unmarshal(rules.Code, &ruleMap); err != nil {
		return nil
	}

	etypeRules, ok := ruleMap[etype].(map[string]interface{})
	if !ok {
		return nil
	}

	allowRules, ok := etypeRules["allow"].(map[string]interface{})
	if !ok {
		return nil
	}

	fieldsRules, ok := allowRules["fields"].(map[string]interface{})
	if !ok {
		return nil
	}

	hidden := map[string]bool{}
	for field, ruleExpr := range fieldsRules {
		ruleStr, ok := ruleExpr.(string)
		if !ok {
			continue
		}
		result := pe.CheckPermission(ctx, ruleStr, permCtx, etype, "view", data)
		if !result.Allowed {
			hidden[field] = true
		}
	}
	return hidden
}

// ---- Simple expression evaluator ----
// Supports the common patterns used in InstantDB CEL rules:
// - "true", "false"
// - "auth.id != null" / "auth.id == null"
// - "auth.id == data.userId"
// - "auth.email in ['a@b.com']"
// - "data.creatorId == auth.id"

func evalExpr(expr string, env map[string]interface{}) (interface{}, error) {
	expr = strings.TrimSpace(expr)

	// Handle literal booleans
	if expr == "true" {
		return true, nil
	}
	if expr == "false" {
		return false, nil
	}

	// Handle logical operators (split on && and ||)
	// Check for || first (lower precedence)
	if parts := splitLogical(expr, "||"); len(parts) > 1 {
		for _, part := range parts {
			result, err := evalExpr(part, env)
			if err != nil {
				return nil, err
			}
			if b, ok := result.(bool); ok && b {
				return true, nil
			}
		}
		return false, nil
	}

	// Check for &&
	if parts := splitLogical(expr, "&&"); len(parts) > 1 {
		for _, part := range parts {
			result, err := evalExpr(part, env)
			if err != nil {
				return nil, err
			}
			if b, ok := result.(bool); ok && !b {
				return false, nil
			}
		}
		return true, nil
	}

	// Handle negation
	if strings.HasPrefix(expr, "!") {
		result, err := evalExpr(expr[1:], env)
		if err != nil {
			return nil, err
		}
		if b, ok := result.(bool); ok {
			return !b, nil
		}
		return result == nil, nil
	}

	// Handle parentheses
	if strings.HasPrefix(expr, "(") && strings.HasSuffix(expr, ")") {
		return evalExpr(expr[1:len(expr)-1], env)
	}

	// Handle comparison operators
	for _, op := range []string{"!=", "==", ">=", "<=", ">", "<"} {
		if parts := splitComparison(expr, op); len(parts) == 2 {
			left, err := resolveValue(strings.TrimSpace(parts[0]), env)
			if err != nil {
				return nil, err
			}
			right, err := resolveValue(strings.TrimSpace(parts[1]), env)
			if err != nil {
				return nil, err
			}
			return compare(left, right, op)
		}
	}

	// Handle "in" operator: "value in [list]"
	if idx := strings.Index(expr, " in "); idx > 0 {
		leftStr := strings.TrimSpace(expr[:idx])
		rightStr := strings.TrimSpace(expr[idx+4:])

		left, err := resolveValue(leftStr, env)
		if err != nil {
			return nil, err
		}

		right, err := resolveValue(rightStr, env)
		if err != nil {
			return nil, err
		}

		if list, ok := right.([]interface{}); ok {
			for _, item := range list {
				if fmt.Sprintf("%v", item) == fmt.Sprintf("%v", left) {
					return true, nil
				}
			}
			return false, nil
		}

		return false, nil
	}

	// Handle "!= null" style check on a path
	if strings.HasSuffix(expr, " != null") {
		path := strings.TrimSpace(strings.TrimSuffix(expr, " != null"))
		val, _ := resolveValue(path, env)
		return val != nil, nil
	}

	// Resolve as a value
	val, err := resolveValue(expr, env)
	if err != nil {
		return nil, err
	}
	return val, nil
}

func resolveValue(expr string, env map[string]interface{}) (interface{}, error) {
	expr = strings.TrimSpace(expr)

	// String literals
	if (strings.HasPrefix(expr, "'") && strings.HasSuffix(expr, "'")) ||
		(strings.HasPrefix(expr, "\"") && strings.HasSuffix(expr, "\"")) {
		return expr[1 : len(expr)-1], nil
	}

	// Null
	if expr == "null" || expr == "nil" {
		return nil, nil
	}

	// Boolean
	if expr == "true" {
		return true, nil
	}
	if expr == "false" {
		return false, nil
	}

	// Number (simple integer)
	if len(expr) > 0 && (expr[0] >= '0' && expr[0] <= '9' || expr[0] == '-') {
		var n float64
		if _, err := fmt.Sscanf(expr, "%f", &n); err == nil {
			return n, nil
		}
	}

	// List literal [a, b, c]
	if strings.HasPrefix(expr, "[") && strings.HasSuffix(expr, "]") {
		inner := strings.TrimSpace(expr[1 : len(expr)-1])
		if inner == "" {
			return []interface{}{}, nil
		}
		parts := strings.Split(inner, ",")
		var list []interface{}
		for _, p := range parts {
			v, err := resolveValue(strings.TrimSpace(p), env)
			if err != nil {
				return nil, err
			}
			list = append(list, v)
		}
		return list, nil
	}

	// Dotted path resolution (auth.id, data.userId, etc.)
	if strings.Contains(expr, ".") {
		parts := strings.Split(expr, ".")
		var current interface{} = env
		for _, part := range parts {
			m, ok := current.(map[string]interface{})
			if !ok {
				return nil, nil // path doesn't resolve
			}
			current, ok = m[part]
			if !ok {
				return nil, nil
			}
		}
		return current, nil
	}

	// Simple variable lookup
	if val, ok := env[expr]; ok {
		return val, nil
	}

	return nil, nil
}

func compare(left, right interface{}, op string) (bool, error) {
	// Nil comparisons
	if op == "==" {
		if left == nil && right == nil {
			return true, nil
		}
		if left == nil || right == nil {
			return false, nil
		}
		return fmt.Sprintf("%v", left) == fmt.Sprintf("%v", right), nil
	}
	if op == "!=" {
		if left == nil && right == nil {
			return false, nil
		}
		if left == nil || right == nil {
			return true, nil
		}
		return fmt.Sprintf("%v", left) != fmt.Sprintf("%v", right), nil
	}

	// For numeric comparisons
	leftNum, leftOk := toFloat(left)
	rightNum, rightOk := toFloat(right)

	if leftOk && rightOk {
		switch op {
		case ">":
			return leftNum > rightNum, nil
		case ">=":
			return leftNum >= rightNum, nil
		case "<":
			return leftNum < rightNum, nil
		case "<=":
			return leftNum <= rightNum, nil
		}
	}

	// String comparison
	leftStr := fmt.Sprintf("%v", left)
	rightStr := fmt.Sprintf("%v", right)

	switch op {
	case ">":
		return leftStr > rightStr, nil
	case ">=":
		return leftStr >= rightStr, nil
	case "<":
		return leftStr < rightStr, nil
	case "<=":
		return leftStr <= rightStr, nil
	}

	return false, fmt.Errorf("unsupported comparison: %s", op)
}

func toFloat(v interface{}) (float64, bool) {
	switch n := v.(type) {
	case float64:
		return n, true
	case float32:
		return float64(n), true
	case int:
		return float64(n), true
	case int64:
		return float64(n), true
	case json.Number:
		f, err := n.Float64()
		return f, err == nil
	}
	return 0, false
}

func splitLogical(expr, op string) []string {
	depth := 0
	var parts []string
	start := 0
	for i := 0; i < len(expr); i++ {
		switch expr[i] {
		case '(':
			depth++
		case ')':
			depth--
		}
		if depth == 0 && i+len(op) <= len(expr) && expr[i:i+len(op)] == op {
			parts = append(parts, expr[start:i])
			start = i + len(op)
		}
	}
	parts = append(parts, expr[start:])
	return parts
}

func splitComparison(expr, op string) []string {
	depth := 0
	for i := 0; i < len(expr); i++ {
		switch expr[i] {
		case '(':
			depth++
		case ')':
			depth--
		case '\'', '"':
			// Skip string literals
			quote := expr[i]
			i++
			for i < len(expr) && expr[i] != quote {
				i++
			}
			continue
		}
		if i+len(op) > len(expr) {
			continue
		}
		if depth == 0 && expr[i:i+len(op)] == op {
			// Make sure we're not matching part of a longer operator
			if op == "=" && i > 0 && (expr[i-1] == '!' || expr[i-1] == '<' || expr[i-1] == '>') {
				continue
			}
			if op == "=" && i+len(op) < len(expr) && expr[i+len(op)] == '=' {
				continue
			}
			return []string{expr[:i], expr[i+len(op):]}
		}
	}
	return nil
}
