import { AnimateIn } from '../AnimateIn';

export function GoodAbstractions() {
  return (
    <div className="space-y-[32px]">
      <AnimateIn>
        <h2 className="text-center text-3xl font-semibold sm:text-[60px]">
          Good abstractions compound
        </h2>
      </AnimateIn>

      <AnimateIn delay={100}>
        <div className="mx-auto max-w-[810px] text-center text-[21px] text-balance">
          When agents use a tight abstraction, the benefits multiply at every
          level: for agents, platforms, and end users.
        </div>
      </AnimateIn>
      <AnimateIn delay={100}>
        <div className="grid grid-cols-3 gap-7">
          <div>
            <div className="text-[36px] font-semibold">Agents</div>
            <div className="pt-6">
              <span>For the agent, there's</span>
              <span className="font-semibold"> locality </span>
              <span>
                — it reasons about one interface instead of three systems. Less
                context means fewer hallucinations, fewer retries, fewer wasted
                tokens.
              </span>
            </div>
          </div>
          <div>
            <div className="text-[36px] font-semibold">Platforms</div>
            <div className="pt-6">
              <span>For the platform, there's </span>
              <span className="font-semibold"> efficiency</span>
              <span>
                . Instant is multi-tenant, so 20,000 apps with 1 user can cost
                the same as 1 app with 20,000 users. No VMs to provision. No
                cold starts. No frozen apps.
              </span>
            </div>
          </div>
          <div>
            <div className="text-[36px] font-semibold">End-users</div>
            <div className="pt-6">
              <span>For end-users, there's </span>
              <span className="font-semibold"> extensibility </span>
              <span>
                — because Instant exposes a database-like abstraction, end-users
                with their own agents can query and extend the apps built for
                them. Applications become platforms.
              </span>
            </div>
          </div>
        </div>
      </AnimateIn>
      <div className="pt-5 text-center text-balance">
        These advantages stack. Agents build faster. Platforms host cheaper.
        Users get more. That's what good infrastructure makes possible.
      </div>
    </div>
  );
}
