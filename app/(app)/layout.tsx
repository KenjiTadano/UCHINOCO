import {withHeadingRequest} from "@/lib/heading-trace-server";
import {headingSpan} from "@/lib/heading-trace-core";
import { AIAnalysisRunner } from "./_components/ai-analysis-runner";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AppShell } from "./_components/app-shell";

export const dynamic = "force-dynamic";

async function AppLayoutImpl({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await headingSpan("auth.layout.app",()=>supabase.auth.getUser());

  if (error || !user) {
    redirect("/login");
  }

  return <AppShell analysis={<AIAnalysisRunner key={user.id} />}>{children}</AppShell>;
}

export default function AppLayout(props:{ children: React.ReactNode }){return withHeadingRequest("layout.app",()=>AppLayoutImpl(props))}
