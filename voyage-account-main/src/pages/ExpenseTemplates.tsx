import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Plane, 
  Car, 
  Hotel, 
  Utensils, 
  Briefcase, 
  Plus,
  ArrowRight,
  Star,
  Clock
} from "lucide-react";

interface ExpenseTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  icon: React.ComponentType<any>;
  estimatedAmount: number;
  duration: string;
  commonItems: Array<{
    category: "travel" | "lodging" | "food" | "other";
    description: string;
    estimatedAmount: number;
  }>;
  tags: string[];
  popularity: number;
}

const expenseTemplates: ExpenseTemplate[] = [
  {
    id: "business-trip",
    name: "Business Trip",
    description: "Standard business travel with meetings and client visits",
    category: "Business",
    icon: Briefcase,
    estimatedAmount: 1500,
    duration: "3-5 days",
    commonItems: [
      { category: "travel", description: "Flight tickets", estimatedAmount: 600 },
      { category: "lodging", description: "Hotel accommodation", estimatedAmount: 400 },
      { category: "food", description: "Meals and dining", estimatedAmount: 300 },
      { category: "travel", description: "Local transportation", estimatedAmount: 200 }
    ],
    tags: ["meetings", "client-visits", "standard"],
    popularity: 95
  },
  {
    id: "conference",
    name: "Conference Attendance",
    description: "Attending industry conferences and events",
    category: "Professional Development",
    icon: Plane,
    estimatedAmount: 2000,
    duration: "2-4 days",
    commonItems: [
      { category: "travel", description: "Conference registration", estimatedAmount: 800 },
      { category: "travel", description: "Flight tickets", estimatedAmount: 500 },
      { category: "lodging", description: "Hotel near venue", estimatedAmount: 400 },
      { category: "food", description: "Conference meals", estimatedAmount: 200 },
      { category: "other", description: "Networking events", estimatedAmount: 100 }
    ],
    tags: ["conference", "networking", "professional"],
    popularity: 88
  },
  {
    id: "client-visit",
    name: "Client Site Visit",
    description: "On-site client meetings and project reviews",
    category: "Client Relations",
    icon: Car,
    estimatedAmount: 800,
    duration: "1-2 days",
    commonItems: [
      { category: "travel", description: "Car rental or gas", estimatedAmount: 200 },
      { category: "lodging", description: "Overnight stay", estimatedAmount: 300 },
      { category: "food", description: "Client meals", estimatedAmount: 200 },
      { category: "other", description: "Parking and tolls", estimatedAmount: 100 }
    ],
    tags: ["client", "on-site", "project"],
    popularity: 75
  },
  {
    id: "training",
    name: "Training & Certification",
    description: "Professional training courses and certification programs",
    category: "Professional Development",
    icon: Star,
    estimatedAmount: 1200,
    duration: "2-3 days",
    commonItems: [
      { category: "other", description: "Training fees", estimatedAmount: 600 },
      { category: "travel", description: "Transportation", estimatedAmount: 200 },
      { category: "lodging", description: "Accommodation", estimatedAmount: 300 },
      { category: "food", description: "Meals", estimatedAmount: 100 }
    ],
    tags: ["training", "certification", "skills"],
    popularity: 70
  },
  {
    id: "sales-trip",
    name: "Sales Trip",
    description: "Sales calls and business development activities",
    category: "Sales",
    icon: Briefcase,
    estimatedAmount: 1000,
    duration: "2-3 days",
    commonItems: [
      { category: "travel", description: "Flight or car", estimatedAmount: 400 },
      { category: "lodging", description: "Hotel stay", estimatedAmount: 300 },
      { category: "food", description: "Client entertainment", estimatedAmount: 200 },
      { category: "other", description: "Sales materials", estimatedAmount: 100 }
    ],
    tags: ["sales", "prospects", "business-development"],
    popularity: 82
  },
  {
    id: "team-meeting",
    name: "Team Meeting",
    description: "Team gatherings and collaborative sessions",
    category: "Internal",
    icon: Utensils,
    estimatedAmount: 500,
    duration: "1 day",
    commonItems: [
      { category: "travel", description: "Local travel", estimatedAmount: 100 },
      { category: "food", description: "Team meals", estimatedAmount: 200 },
      { category: "other", description: "Meeting supplies", estimatedAmount: 50 },
      { category: "other", description: "Team building", estimatedAmount: 150 }
    ],
    tags: ["team", "collaboration", "internal"],
    popularity: 65
  }
];

export default function ExpenseTemplates() {
  const navigate = useNavigate();
  const [selectedTemplate, setSelectedTemplate] = useState<ExpenseTemplate | null>(null);

  const useTemplate = (template: ExpenseTemplate) => {
    // Store template data in session storage to pre-populate the form
    sessionStorage.setItem('expenseTemplate', JSON.stringify({
      title: template.name,
      purpose: template.description,
      estimatedAmount: template.estimatedAmount,
      commonItems: template.commonItems
    }));
    
    navigate('/expenses/new');
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "travel":
        return <Plane className="h-4 w-4" />;
      case "lodging":
        return <Hotel className="h-4 w-4" />;
      case "food":
        return <Utensils className="h-4 w-4" />;
      default:
        return <Briefcase className="h-4 w-4" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "travel":
        return "bg-blue-100 text-blue-800";
      case "lodging":
        return "bg-green-100 text-green-800";
      case "food":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Expense Templates</h1>
          <p className="text-muted-foreground">
            Choose from common expense patterns to get started quickly
          </p>
        </div>
        <Button onClick={() => navigate("/expenses/new")}>
          <Plus className="mr-2 h-4 w-4" />
          Create Custom Expense
        </Button>
      </div>

      {/* Popular Templates */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Popular Templates</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {expenseTemplates
            .sort((a, b) => b.popularity - a.popularity)
            .slice(0, 3)
            .map((template) => {
              const Icon = template.icon;
              return (
                <Card key={template.id} className="hover:shadow-md transition-shadow cursor-pointer">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-lg">{template.name}</CardTitle>
                      </div>
                      <Badge variant="secondary" className="flex items-center gap-1">
                        <Star className="h-3 w-3" />
                        {template.popularity}%
                      </Badge>
                    </div>
                    <CardDescription>{template.description}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Estimated Cost:</span>
                      <span className="font-semibold">${template.estimatedAmount}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {template.duration}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {template.tags.slice(0, 2).map((tag) => (
                        <Badge key={tag} variant="outline" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <Button 
                      className="w-full" 
                      onClick={() => useTemplate(template)}
                    >
                      Use Template
                      <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
        </div>
      </div>

      {/* All Templates */}
      <div>
        <h2 className="text-xl font-semibold mb-4">All Templates</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {expenseTemplates.map((template) => {
            const Icon = template.icon;
            return (
              <Card key={template.id} className="hover:shadow-md transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Icon className="h-5 w-5 text-primary" />
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                    </div>
                    <Badge variant="outline">{template.category}</Badge>
                  </div>
                  <CardDescription>{template.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">Common Items:</h4>
                    <div className="space-y-1">
                      {template.commonItems.slice(0, 3).map((item, index) => (
                        <div key={index} className="flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1">
                            <span className={getCategoryColor(item.category)}>
                              {getCategoryIcon(item.category)}
                            </span>
                            <span className="text-muted-foreground">{item.description}</span>
                          </div>
                          <span className="font-medium">${item.estimatedAmount}</span>
                        </div>
                      ))}
                      {template.commonItems.length > 3 && (
                        <div className="text-xs text-muted-foreground">
                          +{template.commonItems.length - 3} more items
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Total Estimate:</span>
                    <span className="font-semibold">${template.estimatedAmount}</span>
                  </div>

                  <div className="flex flex-wrap gap-1">
                    {template.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>

                  <Button 
                    className="w-full" 
                    variant="outline"
                    onClick={() => useTemplate(template)}
                  >
                    Use Template
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Custom Template Info */}
      <Card>
        <CardHeader>
          <CardTitle>Don't see what you need?</CardTitle>
          <CardDescription>
            Create a custom expense from scratch or save your own templates for future use
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={() => navigate("/expenses/new")}>
              <Plus className="mr-2 h-4 w-4" />
              Create Custom Expense
            </Button>
            <Button variant="outline">
              Save Current as Template
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
