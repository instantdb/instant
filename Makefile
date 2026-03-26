.PHONY: setup-llm-rules

setup-llm-rules:
	@for dir in client; do \
		if [ ! -f "$$dir/AGENTS.md" ]; then \
			echo "Read llm-rules.md in this folder" > "$$dir/AGENTS.md"; \
			echo "Created $$dir/AGENTS.md"; \
		else \
			echo "$$dir/AGENTS.md already exists, skipping"; \
		fi; \
		if [ ! -f "$$dir/CLAUDE.md" ]; then \
			ln -s AGENTS.md "$$dir/CLAUDE.md"; \
			echo "Created $$dir/CLAUDE.md -> AGENTS.md"; \
		else \
			echo "$$dir/CLAUDE.md already exists, skipping"; \
		fi; \
	done
