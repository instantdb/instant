.PHONY: setup-llm-rules

setup-llm-rules:
	@for dir in client; do \
		if [ ! -f "$$dir/AGENTS.md" ]; then \
			echo "Important: to understand how to work in this folder, make sure you read llm-rules.md first" > "$$dir/AGENTS.md"; \
			echo "Created $$dir/AGENTS.md"; \
		else \
			echo "$$dir/AGENTS.md already exists, skipping"; \
		fi; \
		if [ -L "$$dir/CLAUDE.md" ] && [ "$$(readlink "$$dir/CLAUDE.md")" = "AGENTS.md" ]; then \
			echo "$$dir/CLAUDE.md -> AGENTS.md already exists, skipping"; \
		else \
			rm -f "$$dir/CLAUDE.md"; \
			ln -s AGENTS.md "$$dir/CLAUDE.md"; \
			echo "Created $$dir/CLAUDE.md -> AGENTS.md"; \
		fi; \
	done
