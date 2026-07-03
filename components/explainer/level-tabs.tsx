"use client";

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import type { Artifact } from "@/lib/explainer/types";
import { Streamdown } from "streamdown";

/**
 * The approved artifact's reading-level toggle: one tab per audience, each
 * rendering that level's title, dek, body markdown, key takeaways, and
 * limitations.
 */
export function LevelTabs({ artifact }: { artifact: Artifact }) {
  const audiences = artifact.meta.audiences;
  if (audiences.length === 0) return null;

  return (
    <Tabs defaultValue={audiences[0].key}>
      <TabsList>
        {audiences.map((a) => (
          <TabsTrigger key={a.key} value={a.key}>
            {a.displayName}
          </TabsTrigger>
        ))}
      </TabsList>
      {audiences.map((a) => {
        const level = artifact.levels.find((l) => l.audienceKey === a.key);
        return (
          <TabsContent
            key={a.key}
            value={a.key}
            className="flex flex-col gap-6 pt-4"
          >
            {!level ? (
              <p className="text-sm text-muted-foreground">
                No content was produced for this level.
              </p>
            ) : (
              <>
                <div className="flex flex-col gap-1">
                  <h2 className="font-heading text-xl font-semibold tracking-tight">
                    {level.title}
                  </h2>
                  {level.dek && (
                    <p className="text-sm text-muted-foreground">{level.dek}</p>
                  )}
                </div>
                <Streamdown className="max-w-none text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
                  {level.bodyMarkdown}
                </Streamdown>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Key takeaways</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed">
                        {level.keyTakeaways.map((t, i) => (
                          <li key={i}>{t}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                  <Card size="sm">
                    <CardHeader>
                      <CardTitle>Limitations</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="flex list-disc flex-col gap-1.5 pl-4 text-xs leading-relaxed">
                        {level.limitations.map((l, i) => (
                          <li key={i}>{l}</li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
