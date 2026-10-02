import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();

  const handleGoHome = () => {
    setLocation("/");
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-lg mx-4 shadow-xl border border-border bg-surface backdrop-blur-md rounded-3xl">
        <CardContent className="pt-8 pb-8 text-center">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-rose-500/20 rounded-full animate-ping" />
              <AlertCircle className="relative h-16 w-16 text-rose-500" />
            </div>
          </div>

          <h1 className="text-4xl font-bold text-text-primary mb-2 font-['Space_Grotesk',sans-serif]">404</h1>

          <h2 className="text-xl font-semibold text-text-primary mb-4 font-['Space_Grotesk',sans-serif]">
            Page Not Found
          </h2>

          <p className="text-text-secondary mb-8 leading-relaxed text-sm">
            Sorry, the page you are looking for doesn't exist.
            <br />
            It may have been moved or deleted.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={handleGoHome}
              className="bg-primary hover:bg-primary-hover text-primary-foreground px-6 py-2.5 rounded-xl transition-all duration-200 shadow-md font-medium cursor-pointer"
            >
              <Home className="w-4 h-4 mr-2" />
              Go Home
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
