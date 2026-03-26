.PHONY: setup-llm-rules

setup-llm-rules:
	@for dir in client; do \
		if [ -e "$$dir/AGENTS.md" ] || [ -L "$$dir/AGENTS.md" ] || [ -e "$$dir/CLAUDE.md" ] || [ -L "$$dir/CLAUDE.md" ]; then \
			echo "$$dir: AGENTS.md or CLAUDE.md already exists, skipping"; \
		else \
			echo "Important: to understand how to work in this folder, make sure you read llm-rules.md first" > "$$dir/AGENTS.md"; \
			ln -s AGENTS.md "$$dir/CLAUDE.md"; \
			echo "Created $$dir/AGENTS.md and $$dir/CLAUDE.md -> AGENTS.md"; \
		fi; \
	done
