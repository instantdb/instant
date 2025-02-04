import {
  Button,
  Checkbox,
  CodeEditor,
  Content,
  Copyable,
  Hint,
  JSONEditor,
  ScreenHeading,
  SectionHeading,
  Select,
  SubsectionHeading,
  TabBar,
  TextInput,
  ToggleCollection,
  ToggleGroup,
} from '@/components/ui';
import { useIsHydrated } from '@/lib/hooks/useIsHydrated';

function Example({
  children,
  label,
}: {
  children: React.ReactNode;
  label: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="font-mono text-xs text-gray-500">{label}</div>
      <div className="dots rounded-sm border p-4">{children}</div>
    </div>
  );
}

function GroupName({ children }: { children: React.ReactNode }) {
  return <h3 className="font-mono text-xl font-bold">Info</h3>;
}

export default function UI() {
  const isHydrated = useIsHydrated();
  if (!isHydrated) return null;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <h2 className="text-center font-mono text-2xl font-bold text-slate-500">
        instant/ui
      </h2>
      <GroupName>Info</GroupName>
      <Example label={`Content`}>
        <Content>
          <strong>Lorem ipsum</strong> dolor sit amet{' '}
          <a href="#">consectetur</a> adipisicing elit. Possimus dolorem libero
          odio, dicta necessitatibus incidunt rem natus. Maxime dolore in porro
          excepturi autem necessitatibus suscipit, officiis esse sed{' '}
          <em>exercitationem ratione?</em>
        </Content>
      </Example>
      <Example label={`ScreenHeading`}>
        <ScreenHeading>Screen heading</ScreenHeading>
      </Example>
      <Example label={`SectionHeading`}>
        <SectionHeading>Section heading</SectionHeading>
      </Example>
      <Example label={`SubsectionHeading`}>
        <SubsectionHeading>Subsection heading</SubsectionHeading>
      </Example>
      <Example label={`Hint`}>
        <Hint>
          Lorem ipsum dolor sit amet consectetur adipisicing elit. Doloremque
          dolorum nulla atque et? Illum, ipsam exercitationem harum recusandae
          error quibusdam voluptatem, inventore eligendi expedita, accusantium
          sed eos nesciunt porro iure?
        </Hint>
      </Example>
      <Example label={`TextInput`}>
        <TextInput
          label="Input"
          placeholder="Text input..."
          value=""
          onChange={() => {}}
        />
      </Example>
      <Example label={`TextInput`}>
        <TextInput
          label="Input"
          placeholder="Text input..."
          value=""
          onChange={() => {}}
        />
      </Example>
      <GroupName>Controls</GroupName>
      <Example label={`TextInput`}>
        <TextInput
          label="Input"
          placeholder="Text input..."
          value=""
          onChange={() => {}}
        />
      </Example>
      <Example label={`TextInput: error`}>
        <TextInput
          label="Input"
          placeholder="Text input..."
          value="Bad"
          error="Oops! Something broke"
          onChange={() => {}}
        />
      </Example>
      <Example label={`Checkbox`}>
        <Checkbox checked label="Check" onChange={() => {}} />
      </Example>
      <Example label={`Checkbox`}>
        <TabBar
          selectedId="a"
          onSelect={() => {}}
          tabs={[
            {
              id: 'a',
              label: 'Tab A',
            },
            {
              id: 'b',
              label: 'Tab B',
            },
          ]}
        />
      </Example>
      <Example label={`Select`}>
        <Select
          value="a"
          options={[{ value: 'a', label: 'a' }]}
          onChange={() => {}}
        />
      </Example>
      <Example label={`ToggleCollection`}>
        <ToggleCollection
          selectedId="a"
          items={[
            { id: 'a', label: 'item a' },
            { id: 'b', label: 'item b' },
            { id: 'c', label: 'item c' },
          ]}
          onChange={() => {}}
        />
      </Example>
      <Example label={`ToggleGroup`}>
        <ToggleGroup
          selectedId="a"
          items={[
            { id: 'a', label: 'item a' },
            { id: 'b', label: 'item b' },
            { id: 'c', label: 'item c' },
          ]}
          onChange={() => {}}
        />
      </Example>
      <GroupName>Buttons</GroupName>
      {(['primary', 'secondary', 'subtle', 'destructive'] as const).map(
        (variant) =>
          (['normal', 'mini', 'large', 'xl'] as const).map((size) => (
            <Example label={`Button: ${variant}/${size}`}>
              <div className="space-y-2">
                <div>
                  <Button variant={variant} size={size}>
                    {variant} {size}: as a button
                  </Button>
                </div>
                <div>
                  <Button variant={variant} size={size} type="link" href="foo">
                    {variant} {size}: as a link
                  </Button>
                </div>
              </div>
            </Example>
          )),
      )}
      <GroupName>Misc</GroupName>
      <Example label="Copyable">
        <Copyable label="Copyable" value={Date.now() + ''} />
      </Example>
      <Example label="CodeEditor">
        <div className="h-[30vh]">
          <CodeEditor language="json" value="{}" onChange={() => {}} />
        </div>
      </Example>
      <Example label="JSONEditor">
        <div className="h-[30vh]">
          <JSONEditor label={<>rules.json</>} value="{}" onSave={() => {}} />
        </div>
      </Example>
    </div>
  );
}
