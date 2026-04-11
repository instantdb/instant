// Package engine implements the InstaQL query compiler and transaction processor.
package engine

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/necrodome/instant/server-go/pkg/storage"
)

// InstaQLForm represents a parsed InstaQL query form.
type InstaQLForm struct {
	Etype      string            `json:"k"`
	Options    InstaQLOptions    `json:"option-map"`
	Children   []*InstaQLForm    `json:"child-forms"`
}

// InstaQLOptions holds query modifiers.
type InstaQLOptions struct {
	Where     []WhereClause  `json:"where-conds,omitempty"`
	Order     *OrderClause   `json:"order,omitempty"`
	Limit     *int           `json:"limit,omitempty"`
	First     *int           `json:"first,omitempty"`
	Last      *int           `json:"last,omitempty"`
	Offset    *int           `json:"offset,omitempty"`
	Aggregate string         `json:"aggregate,omitempty"`
	Fields    []string       `json:"fields,omitempty"`
}

// WhereClause represents a single where condition.
type WhereClause struct {
	Path  []string    `json:"path"`
	Value interface{} `json:"value"`
	Op    string      `json:"op"` // "", "$in", "$not", "$gt", "$gte", "$lt", "$lte", "$like", "$ilike", "$isNull"
}

// CompoundWhere represents $and / $or compound conditions.
type CompoundWhere struct {
	And []interface{} `json:"$and,omitempty"` // elements are WhereClause or CompoundWhere
	Or  []interface{} `json:"$or,omitempty"`
}

// OrderClause specifies sort order.
type OrderClause struct {
	Key       string `json:"k"`
	Direction string `json:"direction"` // "asc" or "desc"
}

// InstaQLResult holds the results of an InstaQL query.
type InstaQLResult struct {
	Data   map[string]interface{} `json:"data"`
	Topics []string               `json:"topics"`
}

// QueryEngine executes InstaQL queries against the SQLite store.
type QueryEngine struct {
	db *storage.DB
}

// NewQueryEngine creates a new query engine.
func NewQueryEngine(db *storage.DB) *QueryEngine {
	return &QueryEngine{db: db}
}

// ParseInstaQL takes a raw JSON query from the client and parses it into forms.
//
// Client queries look like:
//
//	{ "users": { "$": { "where": {"name": "Alice"} }, "posts": {} } }
func ParseInstaQL(raw json.RawMessage) ([]*InstaQLForm, error) {
	var queryMap map[string]json.RawMessage
	if err := json.Unmarshal(raw, &queryMap); err != nil {
		return nil, fmt.Errorf("invalid query: %w", err)
	}
	var forms []*InstaQLForm
	for k, v := range queryMap {
		form, err := parseForm(k, v)
		if err != nil {
			return nil, err
		}
		forms = append(forms, form)
	}
	return forms, nil
}

func parseForm(etype string, raw json.RawMessage) (*InstaQLForm, error) {
	form := &InstaQLForm{Etype: etype}

	var fields map[string]json.RawMessage
	if err := json.Unmarshal(raw, &fields); err != nil {
		// empty form like "posts": {}
		return form, nil
	}

	// Parse $ (options)
	if optRaw, ok := fields["$"]; ok {
		opts, err := parseOptions(optRaw)
		if err != nil {
			return nil, fmt.Errorf("parse options for %s: %w", etype, err)
		}
		form.Options = opts
		delete(fields, "$")
	}

	// Parse children
	for childEtype, childRaw := range fields {
		child, err := parseForm(childEtype, childRaw)
		if err != nil {
			return nil, err
		}
		form.Children = append(form.Children, child)
	}

	return form, nil
}

func parseOptions(raw json.RawMessage) (InstaQLOptions, error) {
	var opts InstaQLOptions
	var rawOpts map[string]json.RawMessage
	if err := json.Unmarshal(raw, &rawOpts); err != nil {
		return opts, err
	}

	if whereRaw, ok := rawOpts["where"]; ok {
		clauses, err := parseWhere(whereRaw)
		if err != nil {
			return opts, err
		}
		opts.Where = clauses
	}

	if orderRaw, ok := rawOpts["order"]; ok {
		var order OrderClause
		if err := json.Unmarshal(orderRaw, &order); err == nil {
			opts.Order = &order
		}
	}

	if limitRaw, ok := rawOpts["limit"]; ok {
		var limit int
		if json.Unmarshal(limitRaw, &limit) == nil {
			opts.Limit = &limit
		}
	}
	if firstRaw, ok := rawOpts["first"]; ok {
		var first int
		if json.Unmarshal(firstRaw, &first) == nil {
			opts.First = &first
		}
	}
	if lastRaw, ok := rawOpts["last"]; ok {
		var last int
		if json.Unmarshal(lastRaw, &last) == nil {
			opts.Last = &last
		}
	}
	if offsetRaw, ok := rawOpts["offset"]; ok {
		var offset int
		if json.Unmarshal(offsetRaw, &offset) == nil {
			opts.Offset = &offset
		}
	}

	if aggRaw, ok := rawOpts["aggregate"]; ok {
		var agg string
		json.Unmarshal(aggRaw, &agg)
		opts.Aggregate = agg
	}

	if fieldsRaw, ok := rawOpts["fields"]; ok {
		json.Unmarshal(fieldsRaw, &opts.Fields)
	}

	return opts, nil
}

func parseWhere(raw json.RawMessage) ([]WhereClause, error) {
	var whereMap map[string]interface{}
	if err := json.Unmarshal(raw, &whereMap); err != nil {
		return nil, err
	}
	return parseWhereMap(whereMap)
}

func parseWhereMap(whereMap map[string]interface{}) ([]WhereClause, error) {
	var clauses []WhereClause
	for key, val := range whereMap {
		// Handle $and / $or compound conditions
		if key == "$and" || key == "and" {
			if arr, ok := val.([]interface{}); ok {
				for _, item := range arr {
					if m, ok := item.(map[string]interface{}); ok {
						sub, err := parseWhereMap(m)
						if err != nil {
							return nil, err
						}
						clauses = append(clauses, sub...)
					}
				}
			}
			continue
		}
		if key == "$or" || key == "or" {
			if arr, ok := val.([]interface{}); ok {
				// For $or, wrap each condition with a special marker
				for _, item := range arr {
					if m, ok := item.(map[string]interface{}); ok {
						sub, err := parseWhereMap(m)
						if err != nil {
							return nil, err
						}
						for _, s := range sub {
							s.Op = "$or:" + s.Op
							clauses = append(clauses, s)
						}
					}
				}
			}
			continue
		}

		path := strings.Split(key, ".")
		switch v := val.(type) {
		case map[string]interface{}:
			for op, opVal := range v {
				clauses = append(clauses, WhereClause{Path: path, Value: opVal, Op: op})
			}
		default:
			clauses = append(clauses, WhereClause{Path: path, Value: val, Op: ""})
		}
	}
	return clauses, nil
}

// ExecuteQuery runs an InstaQL query and returns the results.
func (qe *QueryEngine) ExecuteQuery(ctx context.Context, appID string, query json.RawMessage, attrs []*storage.Attr) (*InstaQLResult, error) {
	forms, err := ParseInstaQL(query)
	if err != nil {
		return nil, err
	}

	attrMap := storage.BuildAttrMap(attrs)
	data := make(map[string]interface{})
	var topics []string

	for _, form := range forms {
		result, formTopics, err := qe.executeForm(ctx, appID, form, attrs, attrMap)
		if err != nil {
			return nil, fmt.Errorf("query %s: %w", form.Etype, err)
		}
		data[form.Etype] = result
		topics = append(topics, formTopics...)
	}

	return &InstaQLResult{Data: data, Topics: topics}, nil
}

func (qe *QueryEngine) executeForm(ctx context.Context, appID string, form *InstaQLForm, attrs []*storage.Attr, attrMap map[string]*storage.Attr) (interface{}, []string, error) {
	// Find the id attribute for this etype
	idAttr := storage.SeekAttrByFwdIdent(attrs, form.Etype, "id")
	if idAttr == nil {
		// Return empty result if etype doesn't exist
		return []interface{}{}, nil, nil
	}

	// Build the SQL query for this form
	sqlQuery, args, err := qe.buildFormSQL(appID, form, attrs, attrMap, idAttr)
	if err != nil {
		return nil, nil, err
	}

	// Execute the query to get entity IDs
	rows, err := qe.db.RawDB().QueryContext(ctx, sqlQuery, args...)
	if err != nil {
		return nil, nil, fmt.Errorf("execute query: %w", err)
	}
	defer rows.Close()

	var entityIDs []string
	for rows.Next() {
		var eid string
		if err := rows.Scan(&eid); err != nil {
			return nil, nil, err
		}
		entityIDs = append(entityIDs, eid)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, err
	}

	// Build the topic for invalidation
	topic := fmt.Sprintf("%s:%s:ea", appID, idAttr.ID)
	topics := []string{topic}

	// Fetch all triples for these entities
	entities, err := qe.hydrateEntities(ctx, appID, entityIDs, attrs, attrMap)
	if err != nil {
		return nil, topics, err
	}

	// Aggregate?
	if form.Options.Aggregate == "count" {
		return map[string]interface{}{"aggregate": map[string]interface{}{"count": len(entityIDs)}}, topics, nil
	}

	// Process children (join queries)
	for _, child := range form.Children {
		childTopics, err := qe.resolveChildren(ctx, appID, entities, child, attrs, attrMap)
		if err != nil {
			return nil, topics, err
		}
		topics = append(topics, childTopics...)
	}

	return entities, topics, nil
}

func (qe *QueryEngine) buildFormSQL(appID string, form *InstaQLForm, attrs []*storage.Attr, attrMap map[string]*storage.Attr, idAttr *storage.Attr) (string, []interface{}, error) {
	var sb strings.Builder
	var args []interface{}

	sb.WriteString("SELECT DISTINCT t.entity_id FROM triples t WHERE t.app_id = ? AND t.attr_id = ?")
	args = append(args, appID, idAttr.ID)

	// Apply where clauses
	for _, wc := range form.Options.Where {
		if len(wc.Path) == 1 {
			// Simple attribute filter
			label := wc.Path[0]
			filterAttr := storage.SeekAttrByFwdIdent(attrs, form.Etype, label)
			if filterAttr == nil {
				continue
			}

			valJSON, _ := json.Marshal(wc.Value)

			switch wc.Op {
			case "", "$eq":
				sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') = json_extract(?, '$'))")
				args = append(args, appID, filterAttr.ID, string(valJSON))
			case "$in":
				if vals, ok := wc.Value.([]interface{}); ok && len(vals) > 0 {
					placeholders := make([]string, len(vals))
					for i, v := range vals {
						vJSON, _ := json.Marshal(v)
						placeholders[i] = "json_extract(?, '$')"
						args = append(args, string(vJSON))
					}
					sb.WriteString(fmt.Sprintf(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') IN (%s))",
						strings.Join(placeholders, ",")))
					args = append(args, appID, filterAttr.ID)
					// Reorder: app_id and attr_id should come before placeholders
					// Fix: rebuild the args correctly
					newArgs := args[:len(args)-len(vals)-2]
					sb.Reset()
					sb.WriteString("SELECT DISTINCT t.entity_id FROM triples t WHERE t.app_id = ? AND t.attr_id = ?")
					newArgs2 := []interface{}{appID, idAttr.ID}
					for i := 2; i < len(newArgs); i++ {
						newArgs2 = append(newArgs2, newArgs[i])
					}
					inPH := make([]string, len(vals))
					for i, v := range vals {
						vJSON, _ := json.Marshal(v)
						inPH[i] = "json_extract(?, '$')"
						newArgs2 = append(newArgs2, string(vJSON))
					}
					sb.WriteString(fmt.Sprintf(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') IN (%s))",
						strings.Join(inPH, ",")))
					newArgs2 = append(newArgs2, appID, filterAttr.ID)
					args = newArgs2
				}
			case "$not", "$ne":
				sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') != json_extract(?, '$'))")
				args = append(args, appID, filterAttr.ID, string(valJSON))
			case "$gt":
				sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') > json_extract(?, '$'))")
				args = append(args, appID, filterAttr.ID, string(valJSON))
			case "$gte":
				sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') >= json_extract(?, '$'))")
				args = append(args, appID, filterAttr.ID, string(valJSON))
			case "$lt":
				sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') < json_extract(?, '$'))")
				args = append(args, appID, filterAttr.ID, string(valJSON))
			case "$lte":
				sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') <= json_extract(?, '$'))")
				args = append(args, appID, filterAttr.ID, string(valJSON))
			case "$like":
				if s, ok := wc.Value.(string); ok {
					sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') LIKE ?)")
					args = append(args, appID, filterAttr.ID, s)
				}
			case "$ilike":
				if s, ok := wc.Value.(string); ok {
					sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') LIKE ? COLLATE NOCASE)")
					args = append(args, appID, filterAttr.ID, s)
				}
			case "$isNull":
				if isNull, ok := wc.Value.(bool); ok {
					if isNull {
						sb.WriteString(" AND t.entity_id NOT IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND value != 'null')")
					} else {
						sb.WriteString(" AND t.entity_id IN (SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND value != 'null')")
					}
					args = append(args, appID, filterAttr.ID)
				}
			}
		}
	}

	// Order
	if form.Options.Order != nil {
		orderAttr := storage.SeekAttrByFwdIdent(attrs, form.Etype, form.Options.Order.Key)
		if orderAttr != nil {
			dir := "ASC"
			if form.Options.Order.Direction == "desc" {
				dir = "DESC"
			}
			sb.WriteString(fmt.Sprintf(" ORDER BY (SELECT json_extract(value, '$') FROM triples WHERE app_id = ? AND entity_id = t.entity_id AND attr_id = ?) %s", dir))
			args = append(args, appID, orderAttr.ID)
		}
	}

	// Limit / First / Last
	limit := 0
	if form.Options.Limit != nil {
		limit = *form.Options.Limit
	}
	if form.Options.First != nil {
		limit = *form.Options.First
	}
	if form.Options.Last != nil {
		limit = *form.Options.Last
	}
	if limit > 0 {
		sb.WriteString(fmt.Sprintf(" LIMIT %d", limit))
	}

	// Offset
	if form.Options.Offset != nil && *form.Options.Offset > 0 {
		sb.WriteString(fmt.Sprintf(" OFFSET %d", *form.Options.Offset))
	}

	return sb.String(), args, nil
}

func (qe *QueryEngine) hydrateEntities(ctx context.Context, appID string, entityIDs []string, attrs []*storage.Attr, attrMap map[string]*storage.Attr) ([]map[string]interface{}, error) {
	if len(entityIDs) == 0 {
		return []map[string]interface{}{}, nil
	}

	// Build IN clause
	placeholders := make([]string, len(entityIDs))
	args := make([]interface{}, 0, len(entityIDs)+1)
	args = append(args, appID)
	for i, eid := range entityIDs {
		placeholders[i] = "?"
		args = append(args, eid)
	}

	query := fmt.Sprintf(
		`SELECT entity_id, attr_id, value, value_md5, created_at
		 FROM triples WHERE app_id = ? AND entity_id IN (%s)`,
		strings.Join(placeholders, ","))

	triples, err := qe.db.QueryTriples(ctx, query, args...)
	if err != nil {
		return nil, err
	}

	// Group by entity
	entityMap := make(map[string]map[string]interface{})
	for _, eid := range entityIDs {
		entityMap[eid] = map[string]interface{}{"id": eid}
	}

	for _, t := range triples {
		entity, ok := entityMap[t.EntityID]
		if !ok {
			continue
		}
		attr := attrMap[t.AttrID]
		if attr == nil {
			continue
		}
		// Skip ref attrs in hydration (they're resolved via children)
		if attr.ValueType == "ref" {
			continue
		}

		label := attr.FwdLabel()
		var val interface{}
		json.Unmarshal(t.Value, &val)

		if attr.Cardinality == "many" {
			existing, _ := entity[label].([]interface{})
			entity[label] = append(existing, val)
		} else {
			entity[label] = val
		}
	}

	// Maintain order
	result := make([]map[string]interface{}, 0, len(entityIDs))
	for _, eid := range entityIDs {
		result = append(result, entityMap[eid])
	}
	return result, nil
}

func (qe *QueryEngine) resolveChildren(ctx context.Context, appID string, parentEntities []map[string]interface{}, child *InstaQLForm, attrs []*storage.Attr, attrMap map[string]*storage.Attr) ([]string, error) {
	if len(parentEntities) == 0 {
		return nil, nil
	}

	// Find the link attr connecting parent to child
	parentEtype := "" // Determined from the parent entity's id attr
	for _, attr := range attrs {
		if attr.FwdLabel() == "id" {
			for _, pe := range parentEntities {
				if eid, ok := pe["id"].(string); ok && eid != "" {
					parentEtype = attr.FwdEtype()
					break
				}
			}
			if parentEtype != "" {
				break
			}
		}
	}

	var linkAttr *storage.Attr
	var isForward bool

	// Check forward: parent has a ref attr with label = child.Etype pointing to child
	linkAttr = storage.SeekAttrByFwdIdent(attrs, parentEtype, child.Etype)
	if linkAttr != nil && linkAttr.ValueType == "ref" {
		isForward = true
	} else {
		// Check reverse: child has a ref to parent
		linkAttr = storage.SeekAttrByRevIdent(attrs, parentEtype, child.Etype)
		if linkAttr != nil && linkAttr.ValueType == "ref" {
			isForward = false
		} else {
			// No link found - return empty
			for _, pe := range parentEntities {
				pe[child.Etype] = []interface{}{}
			}
			return nil, nil
		}
	}

	var topics []string
	topic := fmt.Sprintf("%s:%s:vae", appID, linkAttr.ID)
	topics = append(topics, topic)

	for _, pe := range parentEntities {
		parentID, _ := pe["id"].(string)
		if parentID == "" {
			pe[child.Etype] = []interface{}{}
			continue
		}

		var childEntityIDs []string
		var err error

		if isForward {
			// Parent entity_id -> link attr -> child entity_id (in value)
			childEntityIDs, err = qe.getLinkedEntityIDs(ctx, appID, parentID, linkAttr.ID, true)
		} else {
			// Child entity_id -> link attr -> parent entity_id (in value)
			childEntityIDs, err = qe.getLinkedEntityIDs(ctx, appID, parentID, linkAttr.ID, false)
		}

		if err != nil {
			return topics, err
		}

		childEntities, err := qe.hydrateEntities(ctx, appID, childEntityIDs, attrs, attrMap)
		if err != nil {
			return topics, err
		}

		// Recurse for nested children
		for _, grandchild := range child.Children {
			childTopics, err := qe.resolveChildren(ctx, appID, childEntities, grandchild, attrs, attrMap)
			if err != nil {
				return topics, err
			}
			topics = append(topics, childTopics...)
		}

		pe[child.Etype] = childEntities
	}

	return topics, nil
}

func (qe *QueryEngine) getLinkedEntityIDs(ctx context.Context, appID, entityID, attrID string, forward bool) ([]string, error) {
	var query string
	if forward {
		// Entity is the source, value contains the target entity ID
		query = `SELECT json_extract(value, '$') FROM triples WHERE app_id = ? AND entity_id = ? AND attr_id = ? AND vae = 1`
	} else {
		// Entity is the target (in value), find source entity_ids
		query = `SELECT entity_id FROM triples WHERE app_id = ? AND attr_id = ? AND json_extract(value, '$') = ? AND vae = 1`
	}

	var args []interface{}
	if forward {
		args = []interface{}{appID, entityID, attrID}
	} else {
		args = []interface{}{appID, attrID, entityID}
	}

	rows, err := qe.db.RawDB().QueryContext(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		if id != "" {
			ids = append(ids, id)
		}
	}
	return ids, rows.Err()
}
