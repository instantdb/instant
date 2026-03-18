import { AnimateIn } from './AnimateIn';
import { AutoPlayDemo } from './AutoPlayDemo';
import { RealtimeChecklistDemo } from './RealtimeChecklistDemo';
import { OfflineDemoReactions } from './OfflineDemoReactions';
import {
  FeatureBody,
  SectionIntro,
  SectionSubtitle,
  SectionTitle,
  Subheading,
} from './typography';

export function SyncEngine() {
  return (
    <div className="space-y-16">
      {/* Section header */}
      <AnimateIn>
        <SectionIntro>
          <SectionTitle>A database in your frontend</SectionTitle>
          <SectionSubtitle>
            Instant apps aren't like traditional CRUD apps. Instead of endpoints
            your frontend gets a real-time database. This is the same tech that
            makes Linear and Figma so delightful.
          </SectionSubtitle>
        </SectionIntro>
      </AnimateIn>

      {/* Features */}
      <div className="flex flex-col gap-9">
        {/* Instant updates — text left, demo right */}
        <AnimateIn>
          <div className="flex grid-cols-3 flex-col items-stretch gap-6 md:grid md:items-center">
            <div className="col-span-1">
              <Subheading>Instant updates</Subheading>
              <FeatureBody>
                Click a button, toggle a switch, type in a field — whatever you
                do, you see the result right away. Your apps feel fast, so your
                users stay in flow.
              </FeatureBody>
            </div>
            <div className="col-span-2 md:px-12 md:py-9">
              <AutoPlayDemo />
            </div>
          </div>
        </AnimateIn>

        {/* Real-time sync — demo left, text right */}
        <AnimateIn>
          <div className="flex grid-cols-3 flex-col-reverse items-stretch gap-6 md:grid md:items-center">
            <div className="col-span-2 md:px-12 md:py-9">
              <RealtimeChecklistDemo />
            </div>
            <div className="col-span-1">
              <Subheading>Real-time sync</Subheading>
              <FeatureBody>
                Multiplayer experiences work out of the box. If one person makes
                a change, everyone else can see it right away. No need to
                refresh or re-open the app to see the latest.
              </FeatureBody>
            </div>
          </div>
        </AnimateIn>

        {/* Works offline — text left, demo right */}
        <AnimateIn>
          <div className="flex grid-cols-3 flex-col items-stretch gap-6 md:grid md:items-center">
            <div className="col-span-1">
              <Subheading>Works offline</Subheading>
              <FeatureBody>
                Instant apps keep working when you lose connection. When your
                users get back online, everything syncs up without them having
                to do a thing. Pure magic.
              </FeatureBody>
            </div>
            <div className="col-span-2 md:px-12 md:py-9">
              <OfflineDemoReactions />
            </div>
          </div>
        </AnimateIn>
      </div>
    </div>
  );
}
