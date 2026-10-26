import {withHeadingRequest} from "@/lib/heading-trace-server";
import {headingSpan} from "@/lib/heading-trace-core";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function PetAuthorizationLayoutImpl({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ petId: string }>;
}) {
  const { petId } = await params;
  if (!UUID_PATTERN.test(petId)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await headingSpan("auth.layout.pet",()=>supabase.auth.getUser());

  if (userError || !user) {
    redirect("/login");
  }

  const { data: pet, error: petError } = await headingSpan("owner.layout.pet",()=>supabase
    .from("pets")
    .select("id")
    .eq("id", petId)
    .maybeSingle());

  if (petError || !pet) {
    notFound();
  }

  return children;
}

export default function PetAuthorizationLayout(props:{ children: React.ReactNode; params: Promise<{petId:string}> }){return withHeadingRequest("layout.pet",()=>PetAuthorizationLayoutImpl(props))}
