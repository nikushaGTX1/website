import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';

interface LocationEntry {
  id: number;
  type: string;
  address: string;
}

interface PriorityItem {
  id: string;
  label: string;
  selected: boolean;
}

interface CrmLeadRequest {
  fullName: string;
  email: string | null;
  phoneNumber: string | null;

  source: string;
  status: string;
  goal: string;

  preferredContactMethod: string;

  preferredDistricts: string[];

  preferredPropertyType: string;

  bedrooms: number | null;

  budgetMin: number | null;
  budgetMax: number | null;

  currency: string;

  preferences: string;
  message: string;

  requestedViewingAt: string | null;

  apartmentId: number | null;

  customerUserId: string | null;
  assignedAgentId: string | null;

  consentGiven: boolean;
}

@Component({
  selector: 'app-crm-questioner',
  standalone: false,
  templateUrl: './crm-questioner.html',
  styleUrl: './crm-questioner.css',
})
export class CrmQuestioner implements OnInit {

  private readonly apiBaseUrl =
    'https://websiteapi-production-c970.up.railway.app/api/Crm';

  agentToken: string | null = null;
  invalidAgentLink = false;

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute
  ) {}

  ngOnInit(): void {
    const routeValue =
      this.route.snapshot.paramMap.get('agentToken');

    if (!routeValue) {
      this.invalidAgentLink = true;
      return;
    }

    const normalizedRouteValue =
      routeValue.trim();

    if (
      !normalizedRouteValue
        .toLowerCase()
        .startsWith('agent-')
    ) {
      this.invalidAgentLink = true;
      return;
    }

    const token =
      normalizedRouteValue.substring(
        'agent-'.length
      );

    if (!token) {
      this.invalidAgentLink = true;
      return;
    }

    this.agentToken = token;
    this.invalidAgentLink = false;
  }

  currentStep = 1;
  totalSteps = 11;

  isSubmitting = false;
  submitSuccess = false;
  submitError = '';

  draggingPriority: PriorityItem | null = null;

  form = {
    /* ==========================================
       CONTACT
    ========================================== */

    fullName: '',
    phoneNumber: '',

    preferredContactMethod: 'phone',

    /* ==========================================
       QUESTIONNAIRE
    ========================================== */

    moveIn: '',

    budgetMin: null as number | null,
    budgetMax: null as number | null,

    flexibleBudget: false,

    districts: [] as string[],

    chooseDistrictForMe: false,

    bedrooms: '',

    minArea: null as number | null,

    household: '',

    peopleCount: null as number | null,

    hasChildren: null as boolean | null,

    childrenAges: '',

    petType: 'none',

    petSize: '',

    petCount: 1,

    requirements: [] as string[],

    locationTypes: [] as string[],

    rentalPeriod: '',

    priorities: [] as PriorityItem[],
  };


  districts = [
    'ვაკე',
    'საბურთალო',
    'ვერა',
    'მთაწმინდა',
    'ჩუღურეთი',
    'დიდუბე',
    'ნაძალადევი',
    'ისანი',
    'სამგორი',
    'გლდანი',
    'დიღომი',
    'დიდი დიღომი',
    'ორთაჭალა',
    'ავლაბარი',
  ];


  requirementOptions = [
    'ახალი კორპუსი',
    'ახალი რემონტი',
    'პარკინგი',
    'აივანი',
    'კონდიციონერი',
    'ცენტრალური გათბობა',
    'წყნარი ქუჩა',
    'მეტროსთან ახლოს',
    'კარგი ხედი',
    'სკოლა/ბაღი ახლოს',
  ];


  locationOptions = [
    'სამსახური',
    'უნივერსიტეტი',
    'სკოლა',
    'საბავშვო ბაღი',
    'სხვა ადგილი',
  ];


  locationEntries: LocationEntry[] = [];

  private locationId = 1;


  basePriorities: PriorityItem[] = [
    {
      id: 'district',
      label: 'სასურველი უბანი',
      selected: false,
    },

    {
      id: 'transport',
      label: 'ტრანსპორტთან სიახლოვე',
      selected: false,
    },

    {
      id: 'metro',
      label: 'მეტროსთან სიახლოვე',
      selected: false,
    },

    {
      id: 'quiet',
      label: 'წყნარი ქუჩა',
      selected: false,
    },

    {
      id: 'parking',
      label: 'პარკინგი',
      selected: false,
    },

    {
      id: 'view',
      label: 'კარგი ხედი',
      selected: false,
    },

    {
      id: 'new-building',
      label: 'ახალი კორპუსი',
      selected: false,
    },

    {
      id: 'balcony',
      label: 'აივანი',
      selected: false,
    },

    {
      id: 'infrastructure',
      label: 'ინფრასტრუქტურა',
      selected: false,
    },

    {
      id: 'park',
      label: 'პარკთან/მწვანე სივრცესთან ახლოს',
      selected: false,
    },
  ];


  /* ==========================================
     GETTERS
  ========================================== */

  get progress(): number {
    return (this.currentStep / this.totalSteps) * 100;
  }


  get selectedPriorities(): PriorityItem[] {
    return this.form.priorities.filter(
      item => item.selected
    );
  }


  get availablePriorities(): PriorityItem[] {
    return this.form.priorities;
  }


  /* ==========================================
     VALIDATION
  ========================================== */

  get canContinue(): boolean {

    switch (this.currentStep) {

      /*
       * STEP 1
       * Name + phone
       */
      case 1:
        return (
          this.form.fullName.trim().length >= 2 &&
          this.isPhoneValid()
        );


      /*
       * STEP 2
       * Move in date
       */
      case 2:
        return !!this.form.moveIn;


      /*
       * STEP 3
       * Budget
       */
      case 3:
        return (
          this.form.budgetMin !== null &&
          this.form.budgetMax !== null &&
          this.form.budgetMin <= this.form.budgetMax
        );


      /*
       * STEP 4
       * Districts
       */
      case 4:
        return (
          this.form.chooseDistrictForMe ||
          this.form.districts.length > 0
        );


      /*
       * STEP 5
       * Bedrooms
       */
      case 5:
        return !!this.form.bedrooms;


      /*
       * STEP 6
       * Household
       */
      case 6:

        if (!this.form.household) {
          return false;
        }

        if (
          this.form.household === 'family' ||
          this.form.household === 'friends'
        ) {

          if (
            this.form.peopleCount === null ||
            this.form.peopleCount < 1
          ) {
            return false;
          }

        }

        if (this.form.household === 'family') {

          if (this.form.hasChildren === null) {
            return false;
          }

          if (
            this.form.hasChildren === true &&
            !this.form.childrenAges.trim()
          ) {
            return false;
          }

        }

        return true;


      /*
       * STEP 7
       * Pets
       */
      case 7:

        if (!this.form.petType) {
          return false;
        }

        if (
          this.form.petType !== 'none' &&
          this.form.petCount < 1
        ) {
          return false;
        }

        return true;


      /*
       * STEP 8
       * Requirements
       */
      case 8:
        return true;


      /*
       * STEP 9
       * Important locations
       */
      case 9:

        return this.locationEntries.every(
          entry =>
            entry.address.trim().length > 0
        );


      /*
       * STEP 10
       * Rental duration
       */
      case 10:
        return !!this.form.rentalPeriod;


      /*
       * STEP 11
       * TOP 5
       */
      case 11:
        return this.selectedPriorities.length === 5;


      default:
        return true;
    }
  }


  /* ==========================================
     NAVIGATION
  ========================================== */

  nextStep(): void {

    if (!this.canContinue) {
      return;
    }

    if (this.currentStep >= this.totalSteps) {
      return;
    }

    this.currentStep++;


    /*
     * Build dynamic priorities
     * when entering final step
     */
    if (this.currentStep === 11) {
      this.buildPriorities();
    }


    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }


  previousStep(): void {

    if (this.currentStep <= 1) {
      return;
    }

    this.currentStep--;


    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }


  /* ==========================================
     PHONE
  ========================================== */

  private cleanPhone(): string {

    return this.form.phoneNumber
      .trim()
      .replace(/[^\d+]/g, '');
  }


  isPhoneValid(): boolean {

    let phone = this.cleanPhone();


    /*
     * 555123456
     */
    if (/^5\d{8}$/.test(phone)) {
      return true;
    }


    /*
     * 995555123456
     */
    if (/^9955\d{8}$/.test(phone)) {
      return true;
    }


    /*
     * +995555123456
     */
    if (/^\+9955\d{8}$/.test(phone)) {
      return true;
    }


    return false;
  }


  private getFormattedPhone(): string | null {

    let phone = this.cleanPhone();


    if (!phone) {
      return null;
    }


    /*
     * 555123456
     */
    if (/^5\d{8}$/.test(phone)) {

      return `+995${phone}`;

    }


    /*
     * 995555123456
     */
    if (/^9955\d{8}$/.test(phone)) {

      return `+${phone}`;

    }


    /*
     * +995555123456
     */
    if (/^\+9955\d{8}$/.test(phone)) {

      return phone;

    }


    return null;
  }


  /* ==========================================
     STEP 2
  ========================================== */

  selectMoveIn(value: string): void {

    this.form.moveIn = value;

  }


  /* ==========================================
     DISTRICTS
  ========================================== */

  toggleDistrict(district: string): void {

    this.form.chooseDistrictForMe = false;


    const index =
      this.form.districts.indexOf(district);


    if (index >= 0) {

      this.form.districts.splice(
        index,
        1
      );

    } else {

      this.form.districts.push(
        district
      );

    }
  }


  toggleChooseDistrictForMe(): void {

    this.form.chooseDistrictForMe =
      !this.form.chooseDistrictForMe;


    if (this.form.chooseDistrictForMe) {

      this.form.districts = [];

    }
  }


  isDistrictSelected(
    district: string
  ): boolean {

    return this.form.districts.includes(
      district
    );
  }


  /* ==========================================
     BEDROOMS
  ========================================== */

  selectBedrooms(value: string): void {

    this.form.bedrooms = value;

  }


  /* ==========================================
     HOUSEHOLD
  ========================================== */

  selectHousehold(value: string): void {

    this.form.household = value;


    if (
      value === 'alone' ||
      value === 'couple'
    ) {

      this.form.peopleCount = null;

    }


    if (value !== 'family') {

      this.form.hasChildren = null;

      this.form.childrenAges = '';

    }
  }


  /* ==========================================
     PET
  ========================================== */

  selectPet(value: string): void {

    this.form.petType = value;


    if (value === 'none') {

      this.form.petSize = '';

      this.form.petCount = 1;

    }
  }


  /* ==========================================
     REQUIREMENTS
  ========================================== */

  toggleRequirement(
    value: string
  ): void {

    const index =
      this.form.requirements.indexOf(
        value
      );


    if (index >= 0) {

      this.form.requirements.splice(
        index,
        1
      );

    } else {

      this.form.requirements.push(
        value
      );

    }
  }


  isRequirementSelected(
    value: string
  ): boolean {

    return this.form.requirements.includes(
      value
    );
  }


  /* ==========================================
     LOCATIONS
  ========================================== */

  toggleLocationType(
    type: string
  ): void {

    const index =
      this.form.locationTypes.indexOf(
        type
      );


    if (index >= 0) {

      this.form.locationTypes.splice(
        index,
        1
      );


      this.locationEntries =
        this.locationEntries.filter(
          entry =>
            entry.type !== type
        );

    } else {

      this.form.locationTypes.push(
        type
      );


      this.addLocation(
        type
      );

    }
  }


  isLocationSelected(
    type: string
  ): boolean {

    return this.form.locationTypes.includes(
      type
    );
  }


  addLocation(
    type: string
  ): void {

    this.locationEntries.push({

      id:
        this.locationId++,

      type,

      address: '',

    });
  }


  removeLocation(
    entry: LocationEntry
  ): void {

    const sameTypeEntries =
      this.locationEntries.filter(
        item =>
          item.type === entry.type
      );


    /*
     * Keep at least one address
     * when type is selected
     */
    if (sameTypeEntries.length <= 1) {
      return;
    }


    this.locationEntries =
      this.locationEntries.filter(
        item =>
          item.id !== entry.id
      );
  }


  clearLocations(): void {

    this.form.locationTypes = [];

    this.locationEntries = [];

  }


  /* ==========================================
     RENTAL PERIOD
  ========================================== */

  selectRentalPeriod(
    value: string
  ): void {

    this.form.rentalPeriod = value;

  }


  /* ==========================================
     PRIORITIES
  ========================================== */

  buildPriorities(): void {

    const oldSelected =
      this.selectedPriorities.map(
        item => item.label
      );


    const priorities: PriorityItem[] =
      this.basePriorities.map(
        item => ({

          ...item,

          selected:
            oldSelected.includes(
              item.label
            ),

        })
      );


    const locationLabels:
      Record<string, string> = {

        'სამსახური':
          'სამსახურთან ახლოს',

        'უნივერსიტეტი':
          'უნივერსიტეტთან ახლოს',

        'სკოლა':
          'სკოლასთან ახლოს',

        'საბავშვო ბაღი':
          'საბავშვო ბაღთან ახლოს',

        'სხვა ადგილი':
          'მნიშვნელოვან ადგილთან ახლოს',

      };


    this.form.locationTypes.forEach(
      type => {

        const label =
          locationLabels[type] ??
          `${type}-თან ახლოს`;


        const exists =
          priorities.some(
            item =>
              item.label === label
          );


        if (!exists) {

          priorities.push({

            id:
              `location-${type}`,

            label,

            selected:
              oldSelected.includes(
                label
              ),

          });

        }

      }
    );


    this.form.requirements.forEach(
      requirement => {

        const exists =
          priorities.some(
            item =>
              item.label
                .toLowerCase() ===
              requirement
                .toLowerCase()
          );


        if (!exists) {

          priorities.push({

            id:
              `requirement-${requirement}`,

            label:
              requirement,

            selected:
              oldSelected.includes(
                requirement
              ),

          });

        }

      }
    );


    this.form.priorities =
      priorities;
  }


  togglePriority(
    item: PriorityItem
  ): void {

    if (item.selected) {

      item.selected = false;

      return;

    }


    if (
      this.selectedPriorities.length >= 5
    ) {

      return;

    }


    item.selected = true;
  }


  dragStart(
    item: PriorityItem
  ): void {

    if (!item.selected) {
      return;
    }


    this.draggingPriority =
      item;
  }


  dragEnd(): void {

    this.draggingPriority =
      null;
  }


  dropPriority(
    target: PriorityItem
  ): void {

    if (
      !this.draggingPriority ||
      !target.selected ||
      this.draggingPriority.id ===
        target.id
    ) {

      return;

    }


    const selected =
      this.selectedPriorities;


    const fromIndex =
      selected.findIndex(
        item =>
          item.id ===
          this.draggingPriority!.id
      );


    const toIndex =
      selected.findIndex(
        item =>
          item.id ===
          target.id
      );


    if (
      fromIndex === -1 ||
      toIndex === -1
    ) {

      return;

    }


    const reordered =
      [...selected];


    const [moved] =
      reordered.splice(
        fromIndex,
        1
      );


    reordered.splice(
      toIndex,
      0,
      moved
    );


    const unselected =
      this.form.priorities.filter(
        item =>
          !item.selected
      );


    this.form.priorities = [

      ...reordered,

      ...unselected,

    ];


    this.draggingPriority =
      null;
  }


  /* ==========================================
     API HELPERS
  ========================================== */

  private convertBedroomsToNumber():
    number | null {

    if (!this.form.bedrooms) {

      return null;

    }


    if (
      this.form.bedrooms === 'Studio'
    ) {

      return 0;

    }


    if (
      this.form.bedrooms === '4+'
    ) {

      return 4;

    }


    const bedrooms =
      Number(
        this.form.bedrooms
      );


    return Number.isNaN(
      bedrooms
    )
      ? null
      : bedrooms;
  }


  private buildPreferences():
    string {

    const preferences = {

      questionnaireVersion: 2,


      moveIn:
        this.form.moveIn,


      flexibleBudget:
        this.form.flexibleBudget,


      chooseDistrictForMe:
        this.form.chooseDistrictForMe,


      minimumArea:
        this.form.minArea,


      household: {

        type:
          this.form.household,

        peopleCount:
          this.form.peopleCount,

        hasChildren:
          this.form.hasChildren,

        childrenAges:
          this.form.childrenAges,

      },


      pet: {

        type:
          this.form.petType,

        size:
          this.form.petSize,

        count:
          this.form.petCount,

      },


      requirements:
        this.form.requirements,


      importantLocations:
        this.locationEntries.map(
          location => ({

            type:
              location.type,

            address:
              location.address,

          })
        ),


      rentalPeriodMonths:
        this.form.rentalPeriod,


      priorities:
        this.selectedPriorities.map(
          (
            priority,
            index
          ) => ({

            rank:
              index + 1,

            id:
              priority.id,

            label:
              priority.label,

          })
        ),

    };


    return JSON.stringify(
      preferences
    );
  }


  /* ==========================================
     SUBMIT
  ========================================== */

  submitQuestionnaire(): void {

    if (
      this.currentStep !== 11 ||
      this.selectedPriorities.length !== 5
    ) {

      return;

    }


    if (this.isSubmitting) {

      return;

    }


    if (!this.agentToken) {

      this.submitError =
        'ქვიზის ბმული არასწორია ან აგენტთან არ არის დაკავშირებული.';

      return;

    }


    const formattedPhone =
      this.getFormattedPhone();


    if (!formattedPhone) {

      this.submitError =
        'ტელეფონის ნომერი არასწორია.';

      return;

    }


    this.isSubmitting = true;

    this.submitSuccess = false;

    this.submitError = '';


    const submitUrl =
      `${this.apiBaseUrl}/questionnaire-leads/${encodeURIComponent(this.agentToken)}`;


    const payload:
      CrmLeadRequest = {

      fullName:
        this.form.fullName.trim(),

      /*
       * We are NOT asking for email,
       * so send null instead of ""
       */
      email:
        null,

      phoneNumber:
        formattedPhone,

      source:
        'website',

      status:
        'new',

      goal:
        'rent',

      preferredContactMethod:
        'phone',

      preferredDistricts:
        this.form.chooseDistrictForMe
          ? []
          : [...this.form.districts],

      preferredPropertyType:
        'Apartment',

      bedrooms:
        this.convertBedroomsToNumber(),

      budgetMin:
        this.form.budgetMin,

      budgetMax:
        this.form.budgetMax,

      currency:
        'USD',

      preferences:
        this.buildPreferences(),

      message:
        'Lead created from Velven apartment questionnaire.',

      requestedViewingAt:
        null,

      apartmentId:
        null,

      customerUserId:
        null,

      assignedAgentId:
        null,

      consentGiven:
        true,

    };


    console.log(
      'QUESTIONNAIRE LEAD PAYLOAD:',
      payload
    );


    this.http.post(
      submitUrl,
      payload,
      {
        responseType: 'text',
      }
    )
    .subscribe({

      next: response => {

        console.log(
          'CRM lead created:',
          response
        );


        this.isSubmitting =
          false;

        this.submitSuccess =
          true;

        this.submitError =
          '';


        window.scrollTo({
          top: 0,
          behavior: 'smooth',
        });

      },


      error: error => {

        console.error(
          'CRM API ERROR:',
          error
        );


        this.isSubmitting =
          false;

        this.submitSuccess =
          false;


        /*
         * ASP.NET may return JSON
         * inside a string
         */
        if (
          typeof error?.error ===
          'string'
        ) {

          try {

            const parsed =
              JSON.parse(
                error.error
              );


            if (
              parsed?.errors
            ) {

              const messages =
                Object.values(
                  parsed.errors
                )
                .flat()
                .join(' ');


              this.submitError =
                messages ||
                'მოთხოვნის გაგზავნა ვერ მოხერხდა.';


              return;

            }


            if (parsed?.message) {

              this.submitError =
                parsed.message;

              return;

            }


            if (parsed?.title) {

              this.submitError =
                parsed.title;

              return;

            }

          } catch {

            this.submitError =
              error.error;

            return;

          }

        }


        this.submitError =
          error?.error?.message ||
          error?.error?.title ||
          'მოთხოვნის გაგზავნა ვერ მოხერხდა. გთხოვთ სცადოთ თავიდან.';

      },

    });
  }
}