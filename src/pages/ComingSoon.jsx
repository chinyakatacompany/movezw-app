import React from "react";
import { useNavigate } from "react-router-dom";
import { Building2, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ComingSoon({ title = "Coming soon", subtitle }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-sm w-full text-center">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-8 h-8" />
        </div>
        <h1 className="text-xl font-bold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground mt-2">
          {subtitle || "This feature isn't available yet during testing. Check back soon."}
        </p>
        <Button variant="outline" className="mt-6" onClick={() => navigate("/")}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Back home
        </Button>
      </div>
    </div>
  );
}
