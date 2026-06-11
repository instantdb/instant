# ECR lifecycle policies

The ECR lifecycle policies live here. Nothing applies them automatically, so re-run the commands at the bottom of this file after editing.

## Repos

- `instant-prod-ecr`: deployable server images, multi-arch buildx output.
- `instant-prod-ecr-buildcache`: BuildKit registry cache pushed by `--cache-to`. Build cache only, not deployable.

## Tagging scheme for `instant-prod-ecr`

Every build pushed by `.github/workflows/clojure.yml` carries:

- `<git-sha>`: immutable, used by Elastic Beanstalk app versions for rollback.
- `prod` or `staging`: moving tag, advances every push that targets that env. The choice is driven by the commit message: if `[staging]` is in the message it goes to `staging`, otherwise `prod`.

The lifecycle policy below relies on this scheme.

## Policy: `instant-prod-ecr`

Keeps the moving `prod` and `staging` tags forever. SHA-tagged images age out after 90 days. Untagged images (for example, orphaned manifest-list children from deleted indexes) are cleared after 7 days.

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Keep the moving prod tag forever",
      "selection": {
        "tagStatus": "tagged",
        "tagPatternList": ["prod"],
        "countType": "imageCountMoreThan",
        "countNumber": 9999
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 2,
      "description": "Keep the moving staging tag forever",
      "selection": {
        "tagStatus": "tagged",
        "tagPatternList": ["staging"],
        "countType": "imageCountMoreThan",
        "countNumber": 9999
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 3,
      "description": "Expire other tagged images after 90 days",
      "selection": {
        "tagStatus": "tagged",
        "tagPatternList": ["*"],
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 90
      },
      "action": {"type": "expire"}
    },
    {
      "rulePriority": 4,
      "description": "Expire untagged images after 7 days",
      "selection": {
        "tagStatus": "untagged",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 7
      },
      "action": {"type": "expire"}
    }
  ]
}
```

ECR is aware of image indexes, a tagged manifest list protects its referenced platform manifests even when those children appear untagged. So rule 4 only expires true orphans.

## Policy: `instant-prod-ecr-buildcache`

Everything expires after 30 days. The worst case of a too-aggressive policy here is a slow CI build.

```json
{
  "rules": [
    {
      "rulePriority": 1,
      "description": "Expire any image after 30 days",
      "selection": {
        "tagStatus": "any",
        "countType": "sinceImagePushed",
        "countUnit": "days",
        "countNumber": 30
      },
      "action": {"type": "expire"}
    }
  ]
}
```

## Applying

### Via UI

[Production Images](https://us-east-1.console.aws.amazon.com/ecr/repositories/private/597134865416/instant-prod-ecr/_/details?region=us-east-1)

[BuildCache Images](https://us-east-1.console.aws.amazon.com/ecr/repositories/private/597134865416/instant-prod-ecr-buildcache/_/details?region=us-east-1)

### Via CLI

```bash
# Apply policies (re-run after editing this README)
aws --region us-east-1 ecr put-lifecycle-policy \
  --repository-name instant-prod-ecr \
  --lifecycle-policy-text "$(jq -c '.' <<'JSON'
<paste the instant-prod-ecr policy JSON above>
JSON
)"

aws --region us-east-1 ecr put-lifecycle-policy \
  --repository-name instant-prod-ecr-buildcache \
  --lifecycle-policy-text "$(jq -c '.' <<'JSON'
<paste the instant-prod-ecr-buildcache policy JSON above>
JSON
)"
```

After applying, ECR runs the policy asynchronously. Check what would be expired with:

```bash
aws --region us-east-1 ecr get-lifecycle-policy-preview --repository-name instant-prod-ecr
```
