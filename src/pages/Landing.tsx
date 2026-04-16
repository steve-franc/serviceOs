import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  UtensilsCrossed,
  ShoppingCart,
  BarChart3,
  Users,
  Zap,
  Shield,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import dashboardPreview from "@/assets/dashboard-preview.jpg";
import menuPreview from "@/assets/menu-preview.jpg";
import ordersPreview from "@/assets/orders-preview.jpg";

const features = [
  {
    icon: ShoppingCart,
    title: "Fast Order Management",
    description:
      "Create and track orders in seconds with an intuitive interface built for speed.",
  },
  {
    icon: BarChart3,
    title: "Real-Time Reports",
    description:
      "Daily revenue breakdowns, payment method splits, and expense tracking at a glance.",
  },
  {
    icon: Users,
    title: "Team Roles",
    description:
      "Assign managers, servers, and counter staff with scoped access to keep operations tight.",
  },
  {
    icon: Zap,
    title: "Inventory Tracking",
    description:
      "Monitor stock levels in real time and get alerts before items run out.",
  },
  {
    icon: Shield,
    title: "Secure & Reliable",
    description:
      "Enterprise-grade security with role-based access and encrypted data storage.",
  },
  {
    icon: CheckCircle2,
    title: "Tab Management",
    description:
      "Open tabs for customers, add items on the fly, and close out when they're ready.",
  },
];

const screenshots = [
  {
    src: dashboardPreview,
    title: "Dashboard & Analytics",
    description: "Track revenue, orders, and daily targets in real time",
  },
  {
    src: menuPreview,
    title: "Menu Management",
    description: "Organize items by category with availability controls",
  },
  {
    src: ordersPreview,
    title: "Order Creation",
    description: "Quickly build orders with a visual menu and live cart",
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-card/80 backdrop-blur-lg">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <UtensilsCrossed className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-xl font-bold tracking-tight">
              Service<span className="text-primary">OS</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="ghost" asChild>
              <Link to="/auth">Sign In</Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get Started</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute -top-40 right-0 h-[500px] w-[500px] rounded-full bg-primary/5 blur-3xl" />
          <div className="absolute bottom-0 left-0 h-[400px] w-[400px] rounded-full bg-accent/40 blur-3xl" />
        </div>

        <div className="container mx-auto px-4 py-24 text-center md:py-36">
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-1.5 text-sm font-medium text-muted-foreground">
              <Zap className="h-3.5 w-3.5 text-primary" />
              Built for speed &amp; simplicity
            </div>

            <h1 className="font-serif text-4xl font-bold tracking-tight sm:text-5xl md:text-6xl">
              Restaurant operations,{" "}
              <span className="text-primary">simplified</span>
            </h1>

            <p className="mx-auto max-w-2xl text-lg text-muted-foreground md:text-xl">
              From orders to reports, manage your entire restaurant workflow in
              one place. No clutter, no complexity — just results.
            </p>

            <div className="flex flex-col items-center gap-3 pt-4 sm:flex-row sm:justify-center">
              <Button size="lg" className="gap-2 px-8 text-base" asChild>
                <Link to="/auth">
                  Start Free <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="px-8 text-base"
                asChild
              >
                <Link to="/order">Place a Public Order</Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Screenshots */}
      <section className="border-t bg-card/30 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              See it in action
            </h2>
            <p className="mt-3 text-muted-foreground">
              A glimpse into the ServiceOS dashboard and tools.
            </p>
          </div>

          <div className="mx-auto max-w-5xl space-y-12">
            {screenshots.map((shot, i) => (
              <div
                key={shot.title}
                className={`flex flex-col items-center gap-6 md:flex-row ${i % 2 !== 0 ? "md:flex-row-reverse" : ""}`}
              >
                <div className="flex-1 overflow-hidden rounded-xl border shadow-lg">
                  <img
                    src={shot.src}
                    alt={shot.title}
                    className="w-full"
                    loading="lazy"
                    width={1280}
                    height={720}
                  />
                </div>
                <div className="flex-shrink-0 text-center md:w-64 md:text-left">
                  <h3 className="text-xl font-semibold">{shot.title}</h3>
                  <p className="mt-2 text-muted-foreground">{shot.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t bg-card/50 py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto mb-14 max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Everything you need to run your restaurant
            </h2>
            <p className="mt-3 text-muted-foreground">
              Powerful features designed for teams of any size.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group relative rounded-xl border bg-card p-6 transition-all hover:border-primary/30 hover:shadow-lg"
              >
                <div className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <feature.icon className="h-5 w-5" />
                </div>
                <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 md:py-28">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-3xl rounded-2xl border bg-card p-10 text-center shadow-lg md:p-16">
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              Ready to streamline your restaurant?
            </h2>
            <p className="mt-3 text-muted-foreground">
              Sign up in under a minute. No credit card required.
            </p>
            <Button size="lg" className="mt-8 gap-2 px-10 text-base" asChild>
              <Link to="/auth">
                Get Started Free <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto flex flex-col items-center gap-2 px-4 text-sm text-muted-foreground md:flex-row md:justify-between">
          <div className="flex items-center gap-2">
            <UtensilsCrossed className="h-4 w-4 text-primary" />
            <span>ServiceOS</span>
          </div>
          <p>© {new Date().getFullYear()} ServiceOS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
