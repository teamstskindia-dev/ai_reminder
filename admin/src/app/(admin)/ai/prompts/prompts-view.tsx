'use client';

import { ArrowRight, BrainCircuit } from 'lucide-react';
import Link from 'next/link';

import { PageHeader } from '@/components/common/page-header';
import { CardGridSkeleton, EmptyState, ErrorState } from '@/components/common/states';
import { Badge } from '@/components/ui/badge';
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useAiPrompts } from '@/lib/api/ai';
import { extractTemplateVariables, formatRelative } from '@/lib/utils';

import { AiNav } from '../ai-nav';

export function PromptsView() {
  const prompts = useAiPrompts();
  return (
    <>
      <PageHeader
        title="AI"
        description="Prompts are rendered by the backend with {{variables}} and versioned on every save. Output structure is enforced by a JSON schema in code."
      />
      <AiNav />
      {prompts.isPending ? (
        <CardGridSkeleton count={3} />
      ) : prompts.isError ? (
        <ErrorState error={prompts.error} onRetry={() => void prompts.refetch()} />
      ) : prompts.data.length === 0 ? (
        <EmptyState icon={<BrainCircuit />} title="No prompts" description="Seed the database to create the default prompts." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {prompts.data.map((prompt) => {
            const variables = extractTemplateVariables(prompt.content);
            return (
              <Card key={prompt.key} className="relative transition-shadow hover:shadow-md">
                <CardHeader>
                  <CardTitle className="text-base">
                    <Link href={`/ai/prompts/${encodeURIComponent(prompt.key)}`} className="after:absolute after:inset-0">
                      {prompt.name}
                    </Link>
                  </CardTitle>
                  <CardDescription className="font-mono text-xs">{prompt.key}</CardDescription>
                  <CardAction>
                    <Badge variant="secondary">v{prompt.version}</Badge>
                  </CardAction>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="line-clamp-3 text-sm text-muted-foreground">{prompt.description ?? 'No description.'}</p>
                  {variables.length ? (
                    <div className="flex flex-wrap gap-1">
                      {variables.slice(0, 8).map((v) => (
                        <Badge key={v} variant="outline" className="font-mono text-[11px] font-normal">
                          {`{{${v}}}`}
                        </Badge>
                      ))}
                      {variables.length > 8 ? (
                        <Badge variant="outline" className="font-normal">
                          +{variables.length - 8}
                        </Badge>
                      ) : null}
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between text-xs text-muted-foreground">
                  <span>Updated {formatRelative(prompt.updatedAt)}</span>
                  <ArrowRight className="size-4" aria-hidden />
                </CardFooter>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
