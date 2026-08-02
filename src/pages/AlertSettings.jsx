import React from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import NotificationSettings from "@/components/NotificationSettings";

export default function AlertSettings() {
  const navigate = useNavigate();

  return (
    <div className="p-4 pb-8">
      <button onClick={() => navigate(-1)} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
        <ArrowLeft className="w-4 h-4" /> Back
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-1">Alerts</h1>
      <p className="text-sm text-muted-foreground mb-6">Choose how you're notified about quotes, jobs and delivery updates.</p>

      <NotificationSettings description="Get notified instantly — even with the app in the background." />
    </div>
  );
}
