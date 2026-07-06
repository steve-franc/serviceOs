import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type OAuthAuthDetails = {
  client?: { name?: string | null; client_uri?: string | null } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
  scope?: string | null;
  scopes?: string[] | null;
};

// Local typed wrapper for supabase.auth.oauth (beta namespace).
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthAuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: { redirect_url?: string; redirect_to?: string } | null; error: { message: string } | null }>;
};
const oauthApi = (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const [details, setDetails] = useState<OAuthAuthDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!authorizationId) return setError("Missing authorization_id");
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        const next = window.location.pathname + window.location.search;
        window.location.href = "/auth?next=" + encodeURIComponent(next);
        return;
      }
      const { data, error } = await oauthApi.getAuthorizationDetails(authorizationId);
      if (!active) return;
      if (error) return setError(error.message);
      const immediate = data?.redirect_url ?? data?.redirect_to;
      if (immediate && !data?.client) {
        window.location.href = immediate;
        return;
      }
      setDetails(data);
    })();
    return () => {
      active = false;
    };
  }, [authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    const { data, error } = approve
      ? await oauthApi.approveAuthorization(authorizationId)
      : await oauthApi.denyAuthorization(authorizationId);
    if (error) {
      setBusy(false);
      return setError(error.message);
    }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) {
      setBusy(false);
      return setError("No redirect returned by the authorization server.");
    }
    window.location.href = target;
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Helmet>
        <title>Authorize application · serviceOS</title>
      </Helmet>
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Connect to your serviceOS account</CardTitle>
          <CardDescription>
            {error
              ? "There was a problem loading this request."
              : details
              ? `${details.client?.name ?? "An application"} is requesting access to act as you.`
              : "Loading authorization request…"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {details && !error && (
            <>
              <p className="text-sm text-muted-foreground">
                This lets {details.client?.name ?? "the client"} read your business data (orders, menu, summaries) and
                take actions as you through serviceOS tools. You can revoke access at any time.
              </p>
              <div className="flex gap-2">
                <Button disabled={busy} onClick={() => decide(true)} className="flex-1">
                  Approve
                </Button>
                <Button disabled={busy} onClick={() => decide(false)} variant="outline" className="flex-1">
                  Deny
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
