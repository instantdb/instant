.PHONY: setup-llm-rules

setup-llm-rules:
	@for dir in client; do \
		if [ -e "$$dir/AGENTS.md" ] || [ -L "$$dir/AGENTS.md" ] || [ -e "$$dir/CLAUDE.md" ] || [ -L "$$dir/CLAUDE.md" ]; then \
			echo "$$dir: AGENTS.md or CLAUDE.md already exists, skipping"; \
		else \
			echo "Stop. Before doing anything in this folder, read ./llm-rules.md in this directory." > "$$dir/AGENTS.md"; \
			ln -s AGENTS.md "$$dir/CLAUDE.md"; \
			echo "Created $$dir/AGENTS.md and $$dir/CLAUDE.md -> AGENTS.md"; \
		fi; \
	done
