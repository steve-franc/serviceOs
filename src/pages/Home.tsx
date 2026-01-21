import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Store, ChefHat } from "lucide-react";
import { toast } from "sonner";

interface Restaurant {
  id: string;
  full_name: string;
  itemCount: number;
}

const Home = () => {
  const navigate = useNavigate();
  const [restaurants, setRestaurants] = useState<Restaurant[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchRestaurants();
  }, []);

  const fetchRestaurants = async () => {
    try {
      // Get all profiles (restaurants are now just anyone with menu items)
      const { data: menuItems, error: menuError } = await supabase
        .from("menu_items")
        .select("staff_id")
        .eq("is_available", true);

      if (menuError) throw menuError;

      // Get unique staff_ids who have menu items
      const staffIds = [...new Set(menuItems?.map(item => item.staff_id) || [])];

      if (staffIds.length === 0) {
        setRestaurants([]);
        setLoading(false);
        return;
      }

      // Get profiles for these users
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", staffIds);

      if (profilesError) throw profilesError;

      // Count items per restaurant
      const countMap = menuItems?.reduce((acc, item) => {
        acc[item.staff_id] = (acc[item.staff_id] || 0) + 1;
        return acc;
      }, {} as Record<string, number>) || {};

      const restaurantsWithCounts = profiles?.map(profile => ({
        ...profile,
        itemCount: countMap[profile.id] || 0
      })) || [];

      setRestaurants(restaurantsWithCounts);
    } catch (error: any) {
      toast.error("Failed to load restaurants");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleRestaurantClick = (restaurantId: string) => {
    navigate(`/restaurant/${restaurantId}`);
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <ChefHat className="h-8 w-8 text-primary" />
            <h1 className="text-4xl font-bold">Restaurants</h1>
          </div>
          <p className="text-muted-foreground text-lg">
            Browse and order from local restaurants
          </p>
        </div>

        {loading ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">Loading restaurants...</p>
          </div>
        ) : restaurants.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <p className="text-muted-foreground">No restaurants available yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {restaurants.map((restaurant) => (
              <Card
                key={restaurant.id}
                className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] border-2"
                onClick={() => handleRestaurantClick(restaurant.id)}
              >
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                        <Store className="h-6 w-6 text-primary" />
                      </div>
                      <div>
                        <CardTitle className="text-xl">
                          {restaurant.full_name || "Restaurant"}
                        </CardTitle>
                      </div>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="text-sm">
                      {restaurant.itemCount} {restaurant.itemCount === 1 ? "item" : "items"}
                    </Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default Home;
