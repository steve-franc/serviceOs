import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { signInSchema, signUpSchema, registerRestaurantSchema, passwordResetSchema, validateInput, BUSINESS_TYPES } from "@/lib/validations";
type Restaurant = {
  id: string;
  name: string;
};
type AuthMode = "signin" | "signup" | "restaurant";
const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [joinRestaurantId, setJoinRestaurantId] = useState<string>("");
  const [joinRestaurantName, setJoinRestaurantName] = useState<string>("");
  const [newRestaurantName, setNewRestaurantName] = useState<string>("");
  const [businessType, setBusinessType] = useState<string>("restaurant");
  const [mode, setMode] = useState<AuthMode>("signin");
  const [resetEmail, setResetEmail] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const navigate = useNavigate();
  const {
    user
  } = useAuth();

  // Detect password recovery flow (link from reset email)
  useEffect(() => {
    // Initial check from URL hash (in case auth listener fires before mount)
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    if (hashParams.get("type") === "recovery" || hashParams.get("error_code")) {
      if (hashParams.get("error_code")) {
        toast.error(hashParams.get("error_description")?.replace(/\+/g, " ") || "Reset link is invalid or expired");
      } else {
        setShowNewPassword(true);
      }
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        setShowNewPassword(true);
      }
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && !showNewPassword) {
      navigate("/order/create");
    }
  }, [user, navigate, showNewPassword]);
  // Read invite from ?join=<restaurantId> and resolve name
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const inviteId = params.get("join");
    if (!inviteId) return;
    setJoinRestaurantId(inviteId);
    setMode("signup");
    supabase.rpc("get_public_restaurant_info", { _restaurant_id: inviteId }).then(({ data }) => {
      setJoinRestaurantName((data as any)?.name ?? "");
    });
  }, []);
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateInput(signInSchema, {
      email,
      password
    });
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.signInWithPassword({
        email: validation.data.email,
        password: validation.data.password
      });
      if (error) throw error;
      toast.success("Signed in successfully!");
      navigate("/order/create");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateInput(signUpSchema, {
      fullName,
      email,
      password,
      joinRestaurantId: joinRestaurantId || undefined
    });
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }
    if (!joinRestaurantId) {
      toast.error("Please select your restaurant");
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: validation.data.fullName,
            onboarding_mode: "join",
            join_restaurant_id: joinRestaurantId
          }
        }
      });
      if (error) throw error;
      toast.success("Account created! Please check your email to verify your account.");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign up");
    } finally {
      setLoading(false);
    }
  };
  const handleRegisterRestaurant = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateInput(registerRestaurantSchema, {
      fullName,
      email,
      password,
      restaurantName: newRestaurantName,
      businessType,
    });
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: validation.data.fullName,
            onboarding_mode: "create",
            create_restaurant_name: validation.data.restaurantName,
            business_type: validation.data.businessType,
          }
        }
      });
      if (error) throw error;
      toast.success("Account created! Please check your email to verify your account.");
    } catch (error: any) {
      toast.error(error.message || "Failed to register business");
    } finally {
      setLoading(false);
    }
  };
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    const validation = validateInput(passwordResetSchema, {
      email: resetEmail
    });
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }
    setLoading(true);
    try {
      const {
        error
      } = await supabase.auth.resetPasswordForEmail(validation.data.email, {
        redirectTo: `${window.location.origin}/auth`
      });
      if (error) throw error;
      toast.success("Password reset email sent! Check your inbox.");
      setShowResetPassword(false);
      setResetEmail("");
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      // Clean recovery hash from URL
      window.history.replaceState({}, document.title, window.location.pathname);
      // Sign out so user must log in fresh with new password
      await supabase.auth.signOut();
      toast.success("Password updated. Please sign in with your new password.");
      setShowNewPassword(false);
      setNewPassword("");
      setConfirmPassword("");
      setMode("signin");
    } catch (error: any) {
      toast.error(error.message || "Failed to update password");
    } finally {
      setLoading(false);
    }
  };
  const renderSignInForm = () => <form onSubmit={handleSignIn} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="signin-email">Email</Label>
        <Input id="signin-email" type="email" placeholder="staff@restaurant.com" value={email} onChange={e => setEmail(e.target.value.slice(0, 255))} required maxLength={255} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="signin-password">Password</Label>
        <Input id="signin-password" type="password" value={password} onChange={e => setPassword(e.target.value.slice(0, 128))} required maxLength={128} />
      </div>
      <Button type="submit" disabled={loading} className="w-full bg-[#4d0000]">
        {loading ? "Signing in..." : "Sign In"}
      </Button>
      <Button type="button" variant="link" onClick={() => setShowResetPassword(true)} className="w-full">
        Forgot password?
      </Button>
      <div className="text-sm text-center space-y-2 pt-2 border-t">
        <p className="text-muted-foreground">
          Don't have an account?{" "}
          <button type="button" onClick={() => setMode("signup")} className="font-semibold text-foreground hover:underline">
            Sign Up
          </button>
        </p>
        <p className="text-muted-foreground">
          I want to{" "}
          <button type="button" onClick={() => setMode("restaurant")} className="font-semibold text-foreground hover:underline">
            Sign Up as a Business
          </button>
        </p>
      </div>
    </form>;
  const renderSignUpForm = () => {
    if (!joinRestaurantId) {
      return (
        <div className="space-y-4 text-center">
          <div className="rounded-lg border border-border bg-muted/40 p-4 text-sm text-muted-foreground">
            Staff sign-up requires an invitation link from your business manager.
            Ask them to share your invite link, or use the button below to create a new business.
          </div>
          <Button type="button" className="w-full" onClick={() => setMode("restaurant")}>
            Create a New Business Instead
          </Button>
          <div className="text-sm text-center pt-2 border-t">
            <p className="text-muted-foreground">
              Already have an account?{" "}
              <button type="button" onClick={() => setMode("signin")} className="font-semibold text-foreground hover:underline">
                Log In
              </button>
            </p>
          </div>
        </div>
      );
    }
    return (
      <form onSubmit={handleSignUp} className="space-y-4">
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          You are joining <span className="font-semibold">{joinRestaurantName || "this business"}</span> as staff.
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-name">Full Name</Label>
          <Input id="signup-name" type="text" placeholder="John Doe" value={fullName} onChange={e => setFullName(e.target.value.slice(0, 100))} required maxLength={100} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-email">Email</Label>
          <Input id="signup-email" type="email" placeholder="staff@restaurant.com" value={email} onChange={e => setEmail(e.target.value.slice(0, 255))} required maxLength={255} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="signup-password">Password</Label>
          <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value.slice(0, 128))} required minLength={6} maxLength={128} />
        </div>
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? "Creating account..." : "Sign Up"}
        </Button>
        <p className="text-xs text-center text-muted-foreground">
          You'll receive a verification email after signing up. Your business manager will assign your role.
        </p>
        <div className="text-sm text-center pt-2 border-t">
          <p className="text-muted-foreground">
            Already have an account?{" "}
            <button type="button" onClick={() => setMode("signin")} className="font-semibold text-foreground hover:underline">
              Log In
            </button>
          </p>
        </div>
      </form>
    );
  };
  const renderRestaurantForm = () => <form onSubmit={handleRegisterRestaurant} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="restaurant-owner-name">Your Name</Label>
        <Input id="restaurant-owner-name" type="text" placeholder="Jane Doe" value={fullName} onChange={e => setFullName(e.target.value.slice(0, 100))} required maxLength={100} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="restaurant-name">Business Name</Label>
        <Input id="restaurant-name" type="text" placeholder="My Business" value={newRestaurantName} onChange={e => setNewRestaurantName(e.target.value.slice(0, 200))} required maxLength={200} />
      </div>
      <div className="space-y-2">
        <Label>Business Type</Label>
        <Select value={businessType} onValueChange={setBusinessType}>
          <SelectTrigger>
            <SelectValue placeholder="Select business type" />
          </SelectTrigger>
          <SelectContent>
            {BUSINESS_TYPES.map((b) => (
              <SelectItem key={b.value} value={b.value}>{b.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="restaurant-email">Email</Label>
        <Input id="restaurant-email" type="email" placeholder="owner@business.com" value={email} onChange={e => setEmail(e.target.value.slice(0, 255))} required maxLength={255} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="restaurant-password">Password</Label>
        <Input id="restaurant-password" type="password" value={password} onChange={e => setPassword(e.target.value.slice(0, 128))} required minLength={6} maxLength={128} />
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Creating..." : "Create Business"}
      </Button>
      <p className="text-xs text-center text-muted-foreground">
        After email verification, you'll be set up as the Manager for this business.
      </p>
      <div className="text-sm text-center pt-2 border-t">
        <p className="text-muted-foreground">
          Already have an account?{" "}
          <button type="button" onClick={() => setMode("signin")} className="font-semibold text-foreground hover:underline">
            Log In
          </button>
        </p>
      </div>
    </form>;
  const getTitle = () => {
    switch (mode) {
      case "signin":
        return "Sign In";
      case "signup":
        return "Sign Up";
      case "restaurant":
        return "Register Business";
    }
  };
  const getDescription = () => {
    switch (mode) {
      case "signin":
        return "Staff login for order management";
      case "signup":
        return "Join your business as staff";
      case "restaurant":
        return "Create a new business account";
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Helmet>
        <title>Sign in to CoreOS</title>
        <meta name="description" content="Sign in or create your CoreOS account to manage orders, inventory, bookings, and staff for your business." />
        <link rel="canonical" href="https://coreos.lovable.app/auth" />
        <meta property="og:title" content="Sign in to CoreOS" />
        <meta property="og:description" content="Sign in or create your CoreOS account to manage your business operations." />
        <meta property="og:url" content="https://coreos.lovable.app/auth" />
      </Helmet>
      <Card className="w-full max-w-md shadow-[var(--shadow-soft)]">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">{showNewPassword ? "Set New Password" : getTitle()}</CardTitle>
          <CardDescription>{showNewPassword ? "Enter your new password below" : getDescription()}</CardDescription>
        </CardHeader>
        <CardContent>
          {showNewPassword ? <form onSubmit={handleSetNewPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="new-password">New Password</Label>
                <Input id="new-password" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value.slice(0, 128))} required minLength={8} maxLength={128} placeholder="At least 8 characters" autoComplete="new-password" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm New Password</Label>
                <Input id="confirm-password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value.slice(0, 128))} required minLength={8} maxLength={128} placeholder="Re-enter password" autoComplete="new-password" />
                {confirmPassword && newPassword !== confirmPassword && (
                  <p className="text-xs text-destructive">Passwords do not match</p>
                )}
              </div>
              <Button type="submit" className="w-full" disabled={loading || !newPassword || newPassword !== confirmPassword}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form> : showResetPassword ? <div className="space-y-4">
              <div className="text-center">
                <h3 className="text-lg font-semibold mb-2">Reset Password</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter your email and we'll send you a reset link
                </p>
              </div>
              <form onSubmit={handlePasswordReset} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">Email</Label>
                  <Input id="reset-email" type="email" placeholder="your@email.com" value={resetEmail} onChange={e => setResetEmail(e.target.value.slice(0, 255))} required maxLength={255} />
                </div>
                <div className="flex gap-2">
                  <Button type="submit" className="flex-1" disabled={loading}>
                    {loading ? "Sending..." : "Send Reset Link"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowResetPassword(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div> : <>
              {mode === "signin" && renderSignInForm()}
              {mode === "signup" && renderSignUpForm()}
              {mode === "restaurant" && renderRestaurantForm()}
            </>}
        </CardContent>
      </Card>
    </div>;
};
export default Auth;