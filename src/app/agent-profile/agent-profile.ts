import { Component, Input } from '@angular/core';


export interface Agent {
  id: string | number;
  name: string;
  role: string;
  location: string;
  closedDeals: number;
  rating: number;
  avatarUrl: string;
  bio: string;
}
@Component({
  selector: 'app-agent-profile',
  standalone: false,
  templateUrl: './agent-profile.html',
  styleUrl: './agent-profile.css',
})
export class AgentProfile {


@Input() agents: Agent[] = [];
  
  // Controls the skeleton state; set to false once your API completes
  isLoading: boolean = true; 
  
  // Trackers for the new filter/sort interface
  searchQuery: string = '';
  selectedSort: string = 'name-az';

  // Dummy array to render exactly 4 empty wireframe cards while loading
  skeletonCards = [1, 2, 3, 4];

  constructor() { }

  ngOnInit(): void {
    // Example API hook:
    // this.agentService.getAgents().subscribe(data => {
    //   this.agents = data;
    //   this.isLoading = false;
    // });
  }

  onFilterChange(): void {
    // Implement client-side filtering or trigger an API reload here
    console.log(`Filtering by: ${this.searchQuery}, Sorting by: ${this.selectedSort}`);
  }

  onCall(agent: Agent): void {
    console.log(`Calling ${agent.name}`);
  }

  onMessage(agent: Agent): void {
    console.log(`Messaging ${agent.name}`);
  }
}