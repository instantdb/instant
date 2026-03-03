'use client';

import type { ComponentProps, HTMLAttributes } from 'react';

import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRightIcon } from 'lucide-react';
import { createContext, useContext, useMemo } from 'react';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

interface SchemaParameter {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  location?: 'path' | 'query' | 'header';
}

interface SchemaProperty {
  name: string;
  type: string;
  required?: boolean;
  description?: string;
  properties?: SchemaProperty[];
  items?: SchemaProperty;
}

interface SchemaDisplayContextType {
  method: HttpMethod;
  path: string;
  description?: string;
  parameters?: SchemaParameter[];
  requestBody?: SchemaProperty[];
  responseBody?: SchemaProperty[];
}

const SchemaDisplayContext = createContext<SchemaDisplayContextType>({
  method: 'GET',
  path: '',
});

export type SchemaDisplayProps = HTMLAttributes<HTMLDivElement> & {
  method: HttpMethod;
  path: string;
  description?: string;
  parameters?: SchemaParameter[];
  requestBody?: SchemaProperty[];
  responseBody?: SchemaProperty[];
};

export const SchemaDisplay = ({
  method,
  path,
  description,
  parameters,
  requestBody,
  responseBody,
  className,
  children,
  ...props
}: SchemaDisplayProps) => {
  const contextValue = useMemo(
    () => ({
      description,
      method,
      parameters,
      path,
      requestBody,
      responseBody,
    }),
    [description, method, parameters, path, requestBody, responseBody],
  );

  return (
    <SchemaDisplayContext.Provider value={contextValue}>
      <div
        className={cn(
          'bg-background overflow-hidden rounded-lg border',
          className,
        )}
        {...props}
      >
        {children ?? (
          <>
            <SchemaDisplayHeader>
              <div className="flex items-center gap-3">
                <SchemaDisplayMethod />
                <SchemaDisplayPath />
              </div>
            </SchemaDisplayHeader>
            {description && <SchemaDisplayDescription />}
            <SchemaDisplayContent>
              {parameters && parameters.length > 0 && (
                <SchemaDisplayParameters />
              )}
              {requestBody && requestBody.length > 0 && (
                <SchemaDisplayRequest />
              )}
              {responseBody && responseBody.length > 0 && (
                <SchemaDisplayResponse />
              )}
            </SchemaDisplayContent>
          </>
        )}
      </div>
    </SchemaDisplayContext.Provider>
  );
};

export type SchemaDisplayHeaderProps = HTMLAttributes<HTMLDivElement>;

export const SchemaDisplayHeader = ({
  className,
  children,
  ...props
}: SchemaDisplayHeaderProps) => (
  <div
    className={cn('flex items-center gap-3 border-b px-4 py-3', className)}
    {...props}
  >
    {children}
  </div>
);

const methodStyles: Record<HttpMethod, string> = {
  DELETE: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  GET: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  PATCH:
    'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
  POST: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
  PUT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400',
};

export type SchemaDisplayMethodProps = ComponentProps<typeof Badge>;

export const SchemaDisplayMethod = ({
  className,
  children,
  ...props
}: SchemaDisplayMethodProps) => {
  const { method } = useContext(SchemaDisplayContext);

  return (
    <Badge
      className={cn('font-mono text-xs', methodStyles[method], className)}
      variant="secondary"
      {...props}
    >
      {children ?? method}
    </Badge>
  );
};

export type SchemaDisplayPathProps = HTMLAttributes<HTMLSpanElement>;

export const SchemaDisplayPath = ({
  className,
  children,
  ...props
}: SchemaDisplayPathProps) => {
  const { path } = useContext(SchemaDisplayContext);

  // Highlight path parameters
  const highlightedPath = path.replaceAll(
    /\{([^}]+)\}/g,
    '<span class="text-blue-600 dark:text-blue-400">{$1}</span>',
  );

  return (
    <span
      className={cn('font-mono text-sm', className)}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: "needed for parameter highlighting"
      // oxlint-disable-next-line eslint-plugin-react(no-danger)
      dangerouslySetInnerHTML={{ __html: children ?? highlightedPath }}
      {...props}
    />
  );
};

export type SchemaDisplayDescriptionProps =
  HTMLAttributes<HTMLParagraphElement>;

export const SchemaDisplayDescription = ({
  className,
  children,
  ...props
}: SchemaDisplayDescriptionProps) => {
  const { description } = useContext(SchemaDisplayContext);

  return (
    <p
      className={cn(
        'text-muted-foreground border-b px-4 py-3 text-sm',
        className,
      )}
      {...props}
    >
      {children ?? description}
    </p>
  );
};

export type SchemaDisplayContentProps = HTMLAttributes<HTMLDivElement>;

export const SchemaDisplayContent = ({
  className,
  children,
  ...props
}: SchemaDisplayContentProps) => (
  <div className={cn('divide-y', className)} {...props}>
    {children}
  </div>
);

export type SchemaDisplayParametersProps = ComponentProps<typeof Collapsible>;

export const SchemaDisplayParameters = ({
  className,
  children,
  ...props
}: SchemaDisplayParametersProps) => {
  const { parameters } = useContext(SchemaDisplayContext);

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className="group hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors">
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="text-sm font-medium">Parameters</span>
        <Badge className="ml-auto text-xs" variant="secondary">
          {parameters?.length}
        </Badge>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="divide-y border-t">
          {children ??
            parameters?.map((param) => (
              <SchemaDisplayParameter key={param.name} {...param} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export type SchemaDisplayParameterProps = HTMLAttributes<HTMLDivElement> &
  SchemaParameter;

export const SchemaDisplayParameter = ({
  name,
  type,
  required,
  description,
  location,
  className,
  ...props
}: SchemaDisplayParameterProps) => (
  <div className={cn('px-4 py-3 pl-10', className)} {...props}>
    <div className="flex items-center gap-2">
      <span className="font-mono text-sm">{name}</span>
      <Badge className="text-xs" variant="outline">
        {type}
      </Badge>
      {location && (
        <Badge className="text-xs" variant="secondary">
          {location}
        </Badge>
      )}
      {required && (
        <Badge
          className="bg-red-100 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400"
          variant="secondary"
        >
          required
        </Badge>
      )}
    </div>
    {description && (
      <p className="text-muted-foreground mt-1 text-sm">{description}</p>
    )}
  </div>
);

export type SchemaDisplayRequestProps = ComponentProps<typeof Collapsible>;

export const SchemaDisplayRequest = ({
  className,
  children,
  ...props
}: SchemaDisplayRequestProps) => {
  const { requestBody } = useContext(SchemaDisplayContext);

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className="group hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors">
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="text-sm font-medium">Request Body</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {children ??
            requestBody?.map((prop) => (
              <SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export type SchemaDisplayResponseProps = ComponentProps<typeof Collapsible>;

export const SchemaDisplayResponse = ({
  className,
  children,
  ...props
}: SchemaDisplayResponseProps) => {
  const { responseBody } = useContext(SchemaDisplayContext);

  return (
    <Collapsible className={cn(className)} defaultOpen {...props}>
      <CollapsibleTrigger className="group hover:bg-muted/50 flex w-full items-center gap-2 px-4 py-3 text-left transition-colors">
        <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
        <span className="text-sm font-medium">Response</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t">
          {children ??
            responseBody?.map((prop) => (
              <SchemaDisplayProperty key={prop.name} {...prop} depth={0} />
            ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export type SchemaDisplayBodyProps = HTMLAttributes<HTMLDivElement>;

export const SchemaDisplayBody = ({
  className,
  children,
  ...props
}: SchemaDisplayBodyProps) => (
  <div className={cn('divide-y', className)} {...props}>
    {children}
  </div>
);

export type SchemaDisplayPropertyProps = HTMLAttributes<HTMLDivElement> &
  SchemaProperty & {
    depth?: number;
  };

export const SchemaDisplayProperty = ({
  name,
  type,
  required,
  description,
  properties,
  items,
  depth = 0,
  className,
  ...props
}: SchemaDisplayPropertyProps) => {
  const hasChildren = properties || items;
  const paddingLeft = 40 + depth * 16;

  if (hasChildren) {
    return (
      <Collapsible defaultOpen={depth < 2}>
        <CollapsibleTrigger
          className={cn(
            'group hover:bg-muted/50 flex w-full items-center gap-2 py-3 text-left transition-colors',
            className,
          )}
          style={{ paddingLeft }}
        >
          <ChevronRightIcon className="text-muted-foreground size-4 shrink-0 transition-transform group-data-[state=open]:rotate-90" />
          <span className="font-mono text-sm">{name}</span>
          <Badge className="text-xs" variant="outline">
            {type}
          </Badge>
          {required && (
            <Badge
              className="bg-red-100 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400"
              variant="secondary"
            >
              required
            </Badge>
          )}
        </CollapsibleTrigger>
        {description && (
          <p
            className="text-muted-foreground pb-2 text-sm"
            style={{ paddingLeft: paddingLeft + 24 }}
          >
            {description}
          </p>
        )}
        <CollapsibleContent>
          <div className="divide-y border-t">
            {properties?.map((prop) => (
              <SchemaDisplayProperty
                key={prop.name}
                {...prop}
                depth={depth + 1}
              />
            ))}
            {items && (
              <SchemaDisplayProperty
                {...items}
                depth={depth + 1}
                name={`${name}[]`}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    );
  }

  return (
    <div
      className={cn('py-3 pr-4', className)}
      style={{ paddingLeft }}
      {...props}
    >
      <div className="flex items-center gap-2">
        {/* Spacer for alignment */}
        <span className="size-4" />
        <span className="font-mono text-sm">{name}</span>
        <Badge className="text-xs" variant="outline">
          {type}
        </Badge>
        {required && (
          <Badge
            className="bg-red-100 text-xs text-red-700 dark:bg-red-900/30 dark:text-red-400"
            variant="secondary"
          >
            required
          </Badge>
        )}
      </div>
      {description && (
        <p className="text-muted-foreground mt-1 pl-6 text-sm">{description}</p>
      )}
    </div>
  );
};

export type SchemaDisplayExampleProps = HTMLAttributes<HTMLPreElement>;

export const SchemaDisplayExample = ({
  className,
  children,
  ...props
}: SchemaDisplayExampleProps) => (
  <pre
    className={cn(
      'bg-muted mx-4 mb-4 overflow-auto rounded-md p-4 font-mono text-sm',
      className,
    )}
    {...props}
  >
    {children}
  </pre>
);
