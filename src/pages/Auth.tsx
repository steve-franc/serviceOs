import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { UtensilsCrossed } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { signInSchema, signUpSchema, registerRestaurantSchema, passwordResetSchema, validateInput } from "@/lib/validations";

type Restaurant = { id: string; name: string };
const Auth = () => {
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [joinRestaurantId, setJoinRestaurantId] = useState<string>("");
  const [newRestaurantName, setNewRestaurantName] = useState<string>("");
  
  const [resetEmail, setResetEmail] = useState("");
  const [showResetPassword, setShowResetPassword] = useState(false);
  const navigate = useNavigate();
  const {
    user
  } = useAuth();
  useEffect(() => {
    if (user) {
      navigate("/");
    }
  }, [user, navigate]);

  useEffect(() => {
    // Public list for signup dropdown
    supabase
      .from("restaurants")
      .select("id, name")
      .order("name")
      .then(({ data, error }) => {
        if (error) {
          console.error(error);
          return;
        }
        setRestaurants((data as Restaurant[]) || []);
      });
  }, []);
  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = validateInput(signInSchema, { email, password });
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
      navigate("/");
    } catch (error: any) {
      toast.error(error.message || "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate input
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

    // Validate input
    const validation = validateInput(registerRestaurantSchema, {
      fullName,
      email,
      password,
      restaurantName: newRestaurantName,
    });
    if (!validation.success) {
      toast.error(validation.error);
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: validation.data.email,
        password: validation.data.password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            full_name: validation.data.fullName,
            onboarding_mode: "create",
            create_restaurant_name: validation.data.restaurantName,
          },
        },
      });
      if (error) throw error;
      toast.success("Account created! Please check your email to verify your account.");
    } catch (error: any) {
      toast.error(error.message || "Failed to register restaurant");
    } finally {
      setLoading(false);
    }
  };
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate input
    const validation = validateInput(passwordResetSchema, { email: resetEmail });
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
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md shadow-[var(--shadow-soft)]">
        <CardHeader className="text-center space-y-3">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <UtensilsCrossed className="h-8 w-8 text-primary-foreground" />
            </div>
          </div>
          <CardTitle className="text-2xl font-bold">Restaurant POS</CardTitle>
          <CardDescription>Staff login for order management</CardDescription>
        </CardHeader>
        <CardContent>
          {showResetPassword ? <div className="space-y-4">
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
            </div> : <Tabs defaultValue="signin" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="signin">Sign In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
                <TabsTrigger value="restaurant">Register Restaurant</TabsTrigger>
              </TabsList>

              <TabsContent value="signin">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signin-email">Email</Label>
                    <Input id="signin-email" type="email" placeholder="staff@restaurant.com" value={email} onChange={e => setEmail(e.target.value.slice(0, 255))} required maxLength={255} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signin-password">Password</Label>
                    <Input id="signin-password" type="password" value={password} onChange={e => setPassword(e.target.value.slice(0, 128))} required maxLength={128} />
                  </div>
                  <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                  <Button type="button" variant="link" onClick={() => setShowResetPassword(true)} className="w-full">
                    Forgot password?
                  </Button>
                </form>
              </TabsContent>

               <TabsContent value="signup">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="signup-name">Full Name</Label>
                    <Input 
                      id="signup-name" 
                      type="text" 
                      placeholder="John Doe" 
                      value={fullName} 
                      onChange={e => setFullName(e.target.value.slice(0, 100))} 
                      required 
                      maxLength={100}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-email">Email</Label>
                    <Input id="signup-email" type="email" placeholder="staff@restaurant.com" value={email} onChange={e => setEmail(e.target.value.slice(0, 255))} required maxLength={255} />
                  </div>
                   <div className="space-y-2">
                     <Label>Restaurant</Label>
                     <Select value={joinRestaurantId} onValueChange={setJoinRestaurantId}>
                       <SelectTrigger>
                         <SelectValue placeholder="Select your restaurant" />
                       </SelectTrigger>
                       <SelectContent>
                         {restaurants.map(r => (
                           <SelectItem key={r.id} value={r.id}>
                             {r.name}
                           </SelectItem>
                         ))}
                       </SelectContent>
                     </Select>
                   </div>
                  <div className="space-y-2">
                    <Label htmlFor="signup-password">Password</Label>
                    <Input id="signup-password" type="password" value={password} onChange={e => setPassword(e.target.value.slice(0, 128))} required minLength={6} maxLength={128} />
                  </div>
                   <Button type="submit" disabled={loading} className="w-full">
                    {loading ? "Creating account..." : "Sign Up"}
                  </Button>
                  <p className="text-xs text-center text-muted-foreground">
                     You'll receive a verification email after signing up. Your restaurant manager will assign your role.
                  </p>
                </form>
              </TabsContent>

               <TabsContent value="restaurant">
                 <form onSubmit={handleRegisterRestaurant} className="space-y-4">
                   <div className="space-y-2">
                     <Label htmlFor="restaurant-owner-name">Your Name</Label>
                     <Input
                       id="restaurant-owner-name"
                       type="text"
                       placeholder="Jane Doe"
                       value={fullName}
                       onChange={e => setFullName(e.target.value.slice(0, 100))}
                       required
                       maxLength={100}
                     />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="restaurant-name">Restaurant Name</Label>
                     <Input
                       id="restaurant-name"
                       type="text"
                       placeholder="My Restaurant"
                       value={newRestaurantName}
                       onChange={e => setNewRestaurantName(e.target.value.slice(0, 200))}
                       required
                       maxLength={200}
                     />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="restaurant-email">Email</Label>
                     <Input
                       id="restaurant-email"
                       type="email"
                       placeholder="owner@restaurant.com"
                       value={email}
                       onChange={e => setEmail(e.target.value.slice(0, 255))}
                       required
                       maxLength={255}
                     />
                   </div>
                   <div className="space-y-2">
                     <Label htmlFor="restaurant-password">Password</Label>
                     <Input
                       id="restaurant-password"
                       type="password"
                       value={password}
                       onChange={e => setPassword(e.target.value.slice(0, 128))}
                       required
                       minLength={6}
                       maxLength={128}
                     />
                   </div>
                   <Button type="submit" disabled={loading} className="w-full">
                     {loading ? "Creating..." : "Create Restaurant"}
                   </Button>
                   <p className="text-xs text-center text-muted-foreground">
                     After email verification, you'll be set up as the Manager for this restaurant.
                   </p>
                 </form>
               </TabsContent>
            </Tabs>}
        </CardContent>
      </Card>
    </div>;
};
export default Auth;