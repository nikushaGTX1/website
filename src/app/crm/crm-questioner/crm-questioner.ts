import { Component, HostListener, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import {
  CountryCode,
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  validatePhoneNumberLength,
} from 'libphonenumber-js/max';
import { polyfillCountryFlagEmojis } from 'country-flag-emoji-polyfill';
import { ApiLocation, LocationSuggestion } from '../../models/location';
import { LocationService } from '../../services/location.service';
import { TranslationService } from '../../services/translation.service';
polyfillCountryFlagEmojis();

type AppLanguage = 'ka' | 'en' | 'ru';

interface LocationEntry {
  id: number;
  type: string;
  address: string;
  streetId: number | null;
  streetValue: string;
  streetLabel: string;
  district: string;
}

interface PriorityItem {
  id: string;
  label: string;
  selected: boolean;
}

interface CountryOption {
  code: CountryCode;
  name: string;
  flag: string;
  callingCode: string;
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

  readonly petOptions = [
  {
    value: 'none',
    icon: '🚫',
    label: {
      ka: 'არა',
      en: 'No',
      ru: 'Нет',
    },
  },
  {
    value: 'dog',
    icon: '🐶',
    label: {
      ka: 'ძაღლი',
      en: 'Dog',
      ru: 'Собака',
    },
  },
  {
    value: 'cat',
    icon: '🐱',
    label: {
      ka: 'კატა',
      en: 'Cat',
      ru: 'Кошка',
    },
  },
  {
    value: 'other',
    icon: '🐾',
    label: {
      ka: 'სხვა',
      en: 'Other',
      ru: 'Другое',
    },
  },
];

  readonly childAgeOptions = [
  {
    value: '0-3',
    ka: '0–3 წლის',
    en: '0–3 years',
    ru: '0–3 года',
  },
  {
    value: '4-6',
    ka: '4–6 წლის',
    en: '4–6 years',
    ru: '4–6 лет',
  },
  {
    value: '7-12',
    ka: '7–12 წლის',
    en: '7–12 years',
    ru: '7–12 лет',
  },
  {
    value: '13-17',
    ka: '13–17 წლის',
    en: '13–17 years',
    ru: '13–17 лет',
  },
];

  getDistrictLabel(
  district: {
    id: string;
    ka: string;
    en: string;
    ru: string;
  }
): string {
  return district[this.language];
}


  translateDistrict(district: string): string {
  const key = district
    .trim()
    .normalize('NFC');

  const translations: Record<
    AppLanguage,
    Record<string, string>
  > = {
    ka: {
      'ვაკე': 'ვაკე',
      'საბურთალო': 'საბურთალო',
      'ვერა': 'ვერა',
      'მთაწმინდა': 'მთაწმინდა',
      'ჩუღურეთი': 'ჩუღურეთი',
      'დიდუბე': 'დიდუბე',
      'ნაძალადევი': 'ნაძალადევი',
      'ისანი': 'ისანი',
      'სამგორი': 'სამგორი',
      'გლდანი': 'გლდანი',
      'დიღომი': 'დიღომი',
      'დიდი დიღომი': 'დიდი დიღომი',
      'ორთაჭალა': 'ორთაჭალა',
      'ავლაბარი': 'ავლაბარი',

      Dighomi: 'დიღომი',
      'Didi Dighomi': 'დიდი დიღომი',
      Ortachala: 'ორთაჭალა',
      Avlabari: 'ავლაბარი',
    },

    en: {
      'ვაკე': 'Vake',
      'საბურთალო': 'Saburtalo',
      'ვერა': 'Vera',
      'მთაწმინდა': 'Mtatsminda',
      'ჩუღურეთი': 'Chugureti',
      'დიდუბე': 'Didube',
      'ნაძალადევი': 'Nadzaladevi',
      'ისანი': 'Isani',
      'სამგორი': 'Samgori',
      'გლდანი': 'Gldani',
      'დიღომი': 'Dighomi',
      'დიდი დიღომი': 'Didi Dighomi',
      'ორთაჭალა': 'Ortachala',
      'ავლაბარი': 'Avlabari',

      Vake: 'Vake',
      Saburtalo: 'Saburtalo',
      Vera: 'Vera',
      Mtatsminda: 'Mtatsminda',
      Chugureti: 'Chugureti',
      Didube: 'Didube',
      Nadzaladevi: 'Nadzaladevi',
      Isani: 'Isani',
      Samgori: 'Samgori',
      Gldani: 'Gldani',
      Dighomi: 'Dighomi',
      'Didi Dighomi': 'Didi Dighomi',
      Ortachala: 'Ortachala',
      Avlabari: 'Avlabari',
    },

    ru: {
      'ვაკე': 'Ваке',
      'საბურთალო': 'Сабуртало',
      'ვერა': 'Вера',
      'მთაწმინდა': 'Мтацминда',
      'ჩუღურეთი': 'Чугурети',
      'დიდუბე': 'Дидубе',
      'ნაძალადევი': 'Надзаладеви',
      'ისანი': 'Исани',
      'სამგორი': 'Самгори',
      'გლდანი': 'Глдани',
      'დიღომი': 'Дигоми',
      'დიდი დიღომი': 'Диди Дигоми',
      'ორთაჭალა': 'Ортачала',
      'ავლაბარი': 'Авлабари',

      Dighomi: 'Дигоми',
      'Didi Dighomi': 'Диди Дигоми',
      Ortachala: 'Ортачала',
      Avlabari: 'Авлабари',
    },
  };

  return (
    translations[this.language]?.[key] ??
    key
  );
}

  

  toggleCountryDropdown(): void {
  /*
   * Close phone-country dropdown first.
   */
  this.phoneCountryDropdownOpen = false;
  this.phoneCountrySearch = '';

  /*
   * Toggle nationality dropdown.
   */
  this.countryDropdownOpen =
    !this.countryDropdownOpen;
}


togglePhoneCountryDropdown(): void {
  /*
   * Close nationality dropdown first.
   */
  this.countryDropdownOpen = false;
  this.countrySearch = '';

  /*
   * Toggle phone-country dropdown.
   */
  this.phoneCountryDropdownOpen =
    !this.phoneCountryDropdownOpen;
}

  get phonePlaceholder(): string {
  const country = this.form.phoneCountry;

  if (!country) {
    return 'Phone number';
  }

  try {
    const callingCode = getCountryCallingCode(country);

    return `Phone number (+${callingCode})`;
  } catch {
    return 'Phone number';
  }
}

  private readonly apiBaseUrl =
    'https://websiteapi-production-c970.up.railway.app/api/Crm';

  agentToken: string | null = null;
  invalidAgentLink = false;

  currentStep = 1;
  totalSteps = 11;

  isSubmitting = false;
  submitSuccess = false;
  submitError = '';

  draggingPriority: PriorityItem | null = null;

  language: AppLanguage = 'ka';

  countrySearch = '';
  countryDropdownOpen = false;

  phoneCountryDropdownOpen = false;
  phoneCountrySearch = '';

  countries: CountryOption[] = [];

  readonly languages: {
    code: AppLanguage;
    label: string;
    flag: string;
  }[] = [
    {
      code: 'ka',
      label: 'GEO',
      flag: '🇬🇪',
    },
    {
      code: 'en',
      label: 'EN',
      flag: '🇬🇧',
    },
    {
      code: 'ru',
      label: 'RU',
      flag: '🇷🇺',
    },
  ];

  readonly translations:
    Record<AppLanguage, Record<string, string>> = {
      ka: {
        brandCaption: 'იპოვე შენთვის იდეალური სახლი',

        step: 'ნაბიჯი',
        lastStep: 'ბოლო ნაბიჯი',

        nationalityTitle:
          'აირჩიეთ თქვენი ეროვნება 🌍',

        nationalitySubtitle:
          'აირჩიეთ ქვეყანა. ტელეფონის კოდი ავტომატურად შეივსება.',

        nationality: 'ეროვნება',

        chooseCountry:
          'აირჩიეთ ქვეყანა',

        searchCountry:
          'მოძებნეთ ქვეყანა ან კოდი...',

        contactTitle:
          'დავიწყოთ გაცნობით 👋',

        contactSubtitle:
          'გვითხარით როგორ მოგმართოთ და რომელ ნომერზე დაგიკავშირდეთ საუკეთესო ბინების აღმოჩენისას.',

        fullName:
          'სახელი და გვარი',

        fullNamePlaceholder:
          'მაგ: ნიკა გიორგაძე',

        phone:
          'ტელეფონის ნომერი',

        invalidPhone:
          'შეიყვანეთ სწორი ტელეფონის ნომერი',

        privacyTitle:
          'თქვენი ინფორმაცია უსაფრთხოა',

        privacyText:
          'ნომერს მხოლოდ ვიყენებთ თქვენთან დასაკავშირებლად,  შესაბამისი ბინების შეთავაზების დროს.',

        moveTitle:
          'როდის გჭირდებათ ბინა?',

        moveSubtitle:
          'დაგვეხმარეთ გავიგოთ, რამდენად მალე გსურთ გადასვლა.',

        moveToday:
          'დღესვე / 1–3 დღეში',

        moveTodaySmall:
          'სასწრაფოდ ვეძებ',

        moveWeek:
          '1 კვირაში',

        moveWeekSmall:
          'ახლო მომავალში',

        move24:
          '2–4 კვირაში',

        move24Small:
          'მაქვს დრო არჩევისთვის',

        move13m:
          '1–3 თვეში',

        move13mSmall:
          'წინასწარ ვგეგმავ',

        moveBrowse:
          'ჯერ ვათვალიერებ',

        moveBrowseSmall:
          'მინდა გავიგო რა ვარიანტებია ბაზარზე',

        budgetTitle:
          'რა არის თქვენი ბიუჯეტი?',

        budgetSubtitle:
          'მიუთითეთ სასურველი თვიური ბიუჯეტის დიაპაზონი.',

        minimum:
          'მინიმალური',

        maximum:
          'მაქსიმალური',

        flexibleBudget:
          'კარგი ვარიანტისთვის შემიძლია მცირედი გაზრდა',

        flexibleBudgetSmall:
          'უფრო კარგი მატჩების პოვნაში დაგვეხმარება',

        districtsTitle:
          'რომელი უბნები გაინტერესებთ?',

        districtsSubtitle:
          'შეგიძლიათ რამდენიმე უბანი აირჩიოთ.',

        chooseForMe:
          'არ ვარ დარწმუნებული — შემირჩიეთ',

        chooseForMeSmall:
          'Velven შეარჩევს საუკეთესო უბნებს თქვენი მოთხოვნების მიხედვით.',

        bedroomsTitle:
          'რამდენი საძინებელი გჭირდებათ?',

        bedroomsSubtitle:
          'აირჩიეთ თქვენთვის სასურველი ზომა.',

        minArea:
          'მინიმალური ფართი',

        optional:
          'არასავალდებულო',

        householdTitle:
          'ვინ იცხოვრებს ბინაში?',

        householdSubtitle:
          'ეს ინფორმაცია დაგვეხმარება თქვენი მოთხოვნების სწორად დამუშავებაში.',

        alone:
          'მარტო',

        couple:
          'წყვილი',

        family:
          'ოჯახი',

        friends:
          'მეგობრები / კოლეგები',

        peopleCount:
          'რამდენი ადამიანი იცხოვრებს?',

        peopleCountPlaceholder:
          'მაგ: 4',

        children:
          'გყავთ ბავშვები?',

        yes:
          'კი',

        no:
          'არა',

        childrenAges:
          'რა ასაკის არიან?',

        childrenAgesPlaceholder:
          'მაგ: 4 და 9 წლის',

        petsTitle:
          'გყავთ შინაური ცხოველი?',

        petsSubtitle:
          'ზოგი ბინა ცხოველებთან დაკავშირებით სპეციალურ პირობებს ითვალისწინებს.',

        petNone:
          'არა',

        petDog:
          'ძაღლი',

        petCat:
          'კატა',

        petOther:
          'სხვა',

        otherPetType:
          'რა სახის ცხოველი გყავთ?',

        otherPetTypePlaceholder:
          'მაგ: კურდღელი',

        petSize:
          'რა ზომისაა თქვენი შინაური ცხოველი?',

        petSmall:
          'პატარა',

        petMedium:
          'საშუალო',

        petLarge:
          'დიდი',

        petCount:
          'რამდენი შინაური ცხოველი გყავთ?',

        petInfo:
          'ზომა / დამატებითი ინფორმაცია',

        petInfoPlaceholder:
          'მაგ: პატარა',

        count:
          'რაოდენობა',

        requirementsTitle:
          'რომელი პირობებია თქვენთვის აუცილებელი?',

        requirementsSubtitle:
          'მონიშნეთ ყველა მნიშვნელოვანი პირობა.',

        requirementsLimit:
          'აირჩიეთ მაქსიმუმ 4 პირობა.',

        locationsTitle:
          'არის ადგილი, რომელთან ახლოს ყოფნაც მნიშვნელოვანია?',

        locationsSubtitle:
          'მონიშნეთ თქვენთვის მნიშვნელოვანი ადგილები და მიუთითეთ მისამართები.',

        enterAddress:
          'მიუთითეთ მისამართი ან ადგილი',

        addressPlaceholder:
          'მაგ: პეკინის გამზირი 12',

        streetSearchLoading:
          'ქუჩები იტვირთება…',

        streetSearchError:
          'ქუჩების ჩატვირთვა ვერ მოხერხდა. მისამართი ხელით შეიყვანეთ.',

        streetNoResults:
          'შესაბამისი ქუჩა ვერ მოიძებნა. მისამართი ხელით შეიყვანეთ.',

        addAnother:
          '+ დაამატე კიდევ ერთი',

        noLocation:
          'კონკრეტულ ადგილთან ახლოს ყოფნა არ არის მნიშვნელოვანი',

        rentalTitle:
          'რამდენი ხნით გსურთ ბინის ქირაობა?',

        rentalSubtitle:
          'აირჩიეთ თქვენთვის სასურველი ქირაობის პერიოდი.',

        months3:
          '3 თვე',

        months6:
          '6 თვე',

        months12:
          '12 თვე',

        months12plus:
          '12+ თვე',

        prioritiesTitle:
          'დაალაგეთ თქვენი TOP 5 პრიორიტეტი',

        prioritiesSubtitle:
          'ჯერ აირჩიეთ 5 ყველაზე მნიშვნელოვანი ფაქტორი, შემდეგ გადაათრიეთ სასურველი რიგითობით.',

        selected:
          'არჩეულია',

        choosePriorities:
          'აირჩიეთ პრიორიტეტები',

        successTitle:
          'გმადლობთ, რომ აგვირჩიეთ',

        successText:
          'ჩვენი აგენტი იპოვის ვარიანტს, რომელიც თქვენს ცხოვრების სტილს შეესაბამება.',

        successAction:
          'მთავარ გვერდზე დაბრუნება',

        errorTitle:
          'მოთხოვნის გაგზავნა ვერ მოხერხდა',

        back:
          'უკან',

        continue:
          'გაგრძელება',

        findApartments:
          '✨ ბინების მოძებნა',

        sending:
          'იგზავნება...',

        secure:
          'თქვენი ინფორმაცია უსაფრთხოდ ინახება',
      },

      en: {
        brandCaption:
          'Find your perfect home',

        step:
          'Step',

        lastStep:
          'Final step',

        nationalityTitle:
          'Choose your nationality 🌍',

        nationalitySubtitle:
          'Choose your country. The phone calling code will be selected automatically.',

        nationality:
          'Nationality',

        chooseCountry:
          'Choose a country',

        searchCountry:
          'Search country or calling code...',

        contactTitle:
          "Let's get to know you 👋",

        contactSubtitle:
          'Tell us your name and the phone number where we can contact you about suitable apartments.',

        fullName:
          'Full name',

        fullNamePlaceholder:
          'Example: Nika Giorgadze',

        phone:
          'Phone number',

        invalidPhone:
          'Enter a valid phone number',

        privacyTitle:
          'Your information is safe',

        privacyText:
          'We will only use your number to contact you about relevant apartments.',

        moveTitle:
          'When do you need the apartment?',

        moveSubtitle:
          'Help us understand how soon you would like to move.',

        moveToday:
          'Today / within 1–3 days',

        moveTodaySmall:
          'I need it urgently',

        moveWeek:
          'Within 1 week',

        moveWeekSmall:
          'In the near future',

        move24:
          'Within 2–4 weeks',

        move24Small:
          'I have time to choose',

        move13m:
          'Within 1–3 months',

        move13mSmall:
          'Planning ahead',

        moveBrowse:
          'Just browsing',

        moveBrowseSmall:
          'I want to see what is available on the market',

        budgetTitle:
          'What is your budget?',

        budgetSubtitle:
          'Enter your preferred monthly budget range.',

        minimum:
          'Minimum',

        maximum:
          'Maximum',

        flexibleBudget:
          'I can increase it slightly for a great option',

        flexibleBudgetSmall:
          'This helps us find better matches',

        districtsTitle:
          'Which districts are you interested in?',

        districtsSubtitle:
          'You can select several districts.',

        chooseForMe:
          "I'm not sure — choose for me",

        chooseForMeSmall:
          'Velven will select the best districts based on your requirements.',

        bedroomsTitle:
          'How many bedrooms do you need?',

        bedroomsSubtitle:
          'Choose your preferred apartment size.',

        minArea:
          'Minimum area',

        optional:
          'Optional',

        householdTitle:
          'Who will live in the apartment?',

        householdSubtitle:
          'This information helps us process your requirements correctly.',

        alone:
          'Alone',

        couple:
          'Couple',

        family:
          'Family',

        friends:
          'Friends / colleagues',

        peopleCount:
          'How many people will live there?',

        peopleCountPlaceholder:
          'Example: 4',

        children:
          'Do you have children?',

        yes:
          'Yes',

        no:
          'No',

        childrenAges:
          'How old are they?',

        childrenAgesPlaceholder:
          'Example: 4 and 9 years old',

        petsTitle:
          'Do you have a pet?',

        petsSubtitle:
          'Some apartments have special conditions regarding pets.',

        petNone:
          'No',

        petDog:
          'Dog',

        petCat:
          'Cat',

        petOther:
          'Other',

        otherPetType:
          'What kind of animal do you have?',

        otherPetTypePlaceholder:
          'Example: Rabbit',

        petSize:
          'What size is your pet?',

        petSmall:
          'Small',

        petMedium:
          'Medium',

        petLarge:
          'Large',

        petCount:
          'How many pets?',

        petInfo:
          'Size / additional information',

        petInfoPlaceholder:
          'Example: small',

        count:
          'Count',

        requirementsTitle:
          'Which features are essential for you?',

        requirementsSubtitle:
          'Select all important requirements.',

        requirementsLimit:
          'Choose up to 4 features.',

        locationsTitle:
          'Is there a place you need to be close to?',

        locationsSubtitle:
          'Select important places and enter their addresses.',

        enterAddress:
          'Enter an address or place',

        addressPlaceholder:
          'Example: Pekini Avenue 12',

        streetSearchLoading:
          'Loading streets…',

        streetSearchError:
          'Streets could not be loaded. You can still enter the address manually.',

        streetNoResults:
          'No matching street found. You can still enter the address manually.',

        addAnother:
          '+ Add another',

        noLocation:
          'Being close to a specific place is not important',

        rentalTitle:
          'How long do you want to rent?',

        rentalSubtitle:
          'Choose your preferred rental period.',

        months3:
          '3 months',

        months6:
          '6 months',

        months12:
          '12 months',

        months12plus:
          '12+ months',

        prioritiesTitle:
          'Rank your TOP 5 priorities',

        prioritiesSubtitle:
          'First select the 5 most important factors, then drag them into your preferred order.',

        selected:
          'Selected',

        choosePriorities:
          'Choose priorities',

        successTitle:
          'Thank you for choosing us',

        successText:
          'Our agent will find an option that fits your lifestyle.',

        successAction:
          'Return to home',

        errorTitle:
          'Could not send request',

        back:
          'Back',

        continue:
          'Continue',

        findApartments:
          '✨ Find apartments',

        sending:
          'Sending...',

        secure:
          'Your information is stored securely',
      },

      ru: {
        brandCaption:
          'Найдите идеальное жильё',

        step:
          'Шаг',

        lastStep:
          'Последний шаг',

        nationalityTitle:
          'Выберите ваше гражданство 🌍',

        nationalitySubtitle:
          'Выберите страну. Телефонный код будет установлен автоматически.',

        nationality:
          'Гражданство',

        chooseCountry:
          'Выберите страну',

        searchCountry:
          'Найти страну или код...',

        contactTitle:
          'Давайте познакомимся 👋',

        contactSubtitle:
          'Укажите ваше имя и номер телефона, по которому мы сможем связаться с вами по подходящим квартирам.',

        fullName:
          'Имя и фамилия',

        fullNamePlaceholder:
          'Например: Ника Гиоргадзе',

        phone:
          'Номер телефона',

        invalidPhone:
          'Введите правильный номер телефона',

        privacyTitle:
          'Ваши данные защищены',

        privacyText:
          'Мы будем использовать ваш номер только для связи по подходящим квартирам.',

        moveTitle:
          'Когда вам нужна квартира?',

        moveSubtitle:
          'Помогите понять, насколько быстро вы хотите переехать.',

        moveToday:
          'Сегодня / в течение 1–3 дней',

        moveTodaySmall:
          'Ищу срочно',

        moveWeek:
          'В течение недели',

        moveWeekSmall:
          'В ближайшее время',

        move24:
          'Через 2–4 недели',

        move24Small:
          'Есть время на выбор',

        move13m:
          'Через 1–3 месяца',

        move13mSmall:
          'Планирую заранее',

        moveBrowse:
          'Пока смотрю',

        moveBrowseSmall:
          'Хочу понять, какие варианты есть на рынке',

        budgetTitle:
          'Какой у вас бюджет?',

        budgetSubtitle:
          'Укажите желаемый диапазон месячного бюджета.',

        minimum:
          'Минимум',

        maximum:
          'Максимум',

        flexibleBudget:
          'Могу немного увеличить бюджет ради хорошего варианта',

        flexibleBudgetSmall:
          'Это поможет найти более подходящие варианты',

        districtsTitle:
          'Какие районы вас интересуют?',

        districtsSubtitle:
          'Можно выбрать несколько районов.',

        chooseForMe:
          'Не уверен — выберите за меня',

        chooseForMeSmall:
          'Velven подберёт лучшие районы по вашим требованиям.',

        bedroomsTitle:
          'Сколько спален вам нужно?',

        bedroomsSubtitle:
          'Выберите желаемый размер квартиры.',

        minArea:
          'Минимальная площадь',

        optional:
          'Необязательно',

        householdTitle:
          'Кто будет жить в квартире?',

        householdSubtitle:
          'Эта информация поможет правильно обработать ваши требования.',

        alone:
          'Один / одна',

        couple:
          'Пара',

        family:
          'Семья',

        friends:
          'Друзья / коллеги',

        peopleCount:
          'Сколько человек будет жить?',

        peopleCountPlaceholder:
          'Например: 4',

        children:
          'Есть дети?',

        yes:
          'Да',

        no:
          'Нет',

        childrenAges:
          'Какого они возраста?',

        childrenAgesPlaceholder:
          'Например: 4 и 9 лет',

        petsTitle:
          'Есть домашнее животное?',

        petsSubtitle:
          'У некоторых квартир есть специальные условия для животных.',

        petNone:
          'Нет',

        petDog:
          'Собака',

        petCat:
          'Кошка',

        petOther:
          'Другое',

        otherPetType:
          'Какое у вас животное?',

        otherPetTypePlaceholder:
          'Например: кролик',

        petSize:
          'Какого размера ваш питомец?',

        petSmall:
          'Маленький',

        petMedium:
          'Средний',

        petLarge:
          'Большой',

        petCount:
          'Сколько у вас питомцев?',

        petInfo:
          'Размер / дополнительная информация',

        petInfoPlaceholder:
          'Например: маленькая',

        count:
          'Количество',

        requirementsTitle:
          'Какие условия для вас обязательны?',

        requirementsSubtitle:
          'Отметьте все важные условия.',

        requirementsLimit:
          'Выберите не более 4 условий.',

        locationsTitle:
          'Есть место, рядом с которым важно жить?',

        locationsSubtitle:
          'Выберите важные места и укажите адреса.',

        enterAddress:
          'Укажите адрес или место',

        addressPlaceholder:
          'Например: проспект Пекина 12',

        streetSearchLoading:
          'Загрузка улиц…',

        streetSearchError:
          'Не удалось загрузить улицы. Адрес можно ввести вручную.',

        streetNoResults:
          'Подходящая улица не найдена. Адрес можно ввести вручную.',

        addAnother:
          '+ Добавить ещё',

        noLocation:
          'Близость к конкретному месту не важна',

        rentalTitle:
          'На какой срок вы хотите арендовать?',

        rentalSubtitle:
          'Выберите желаемый срок аренды.',

        months3:
          '3 месяца',

        months6:
          '6 месяцев',

        months12:
          '12 месяцев',

        months12plus:
          '12+ месяцев',

        prioritiesTitle:
          'Расставьте ваши TOP 5 приоритетов',

        prioritiesSubtitle:
          'Сначала выберите 5 самых важных факторов, затем перетащите их в нужном порядке.',

        selected:
          'Выбрано',

        choosePriorities:
          'Выберите приоритеты',

        successTitle:
          'Спасибо, что выбрали нас',

        successText:
          'Наш агент найдёт вариант, который соответствует вашему образу жизни.',

        successAction:
          'Вернуться на главную',

        errorTitle:
          'Не удалось отправить запрос',

        back:
          'Назад',

        continue:
          'Продолжить',

        findApartments:
          '✨ Найти квартиры',

        sending:
          'Отправляется...',

        secure:
          'Ваши данные хранятся в безопасности',
      },
    };

  readonly districts = [
  {
    id: 'vake',
    ka: 'ვაკე',
    en: 'Vake',
    ru: 'Ваке',
  },
  {
    id: 'saburtalo',
    ka: 'საბურთალო',
    en: 'Saburtalo',
    ru: 'Сабуртало',
  },
  {
    id: 'vera',
    ka: 'ვერა',
    en: 'Vera',
    ru: 'Вера',
  },
  {
    id: 'mtatsminda',
    ka: 'მთაწმინდა',
    en: 'Mtatsminda',
    ru: 'Мтацминда',
  },
  {
    id: 'chugureti',
    ka: 'ჩუღურეთი',
    en: 'Chugureti',
    ru: 'Чугурети',
  },
  {
    id: 'didube',
    ka: 'დიდუბე',
    en: 'Didube',
    ru: 'Дидубе',
  },
  {
    id: 'nadzaladevi',
    ka: 'ნაძალადევი',
    en: 'Nadzaladevi',
    ru: 'Надзаладеви',
  },
  {
    id: 'isani',
    ka: 'ისანი',
    en: 'Isani',
    ru: 'Исани',
  },
  {
    id: 'samgori',
    ka: 'სამგორი',
    en: 'Samgori',
    ru: 'Самгори',
  },
  {
    id: 'gldani',
    ka: 'გლდანი',
    en: 'Gldani',
    ru: 'Глдани',
  },
  {
    id: 'dighomi',
    ka: 'დიღომი',
    en: 'Dighomi',
    ru: 'Дигоми',
  },
  {
    id: 'didi-dighomi',
    ka: 'დიდი დიღომი',
    en: 'Didi Dighomi',
    ru: 'Диди Дигоми',
  },
  {
    id: 'ortachala',
    ka: 'ორთაჭალა',
    en: 'Ortachala',
    ru: 'Ортачала',
  },
  {
    id: 'avlabari',
    ka: 'ავლაბარი',
    en: 'Avlabari',
    ru: 'Авлабари',
  },
];

  readonly requirementOptions = [
    'ახალი კორპუსი',
    'ახალი რემონტი',
    'პარკინგი',
    'აივანი',
    'კონდიციონერი',
    'პარკი ახლოს',
    'წყნარი ქუჩა',
    'მეტროსთან ახლოს',
    'კარგი ხედი',
    'სკოლა/ბაღი ახლოს',
  ];

  readonly locationOptions = [
    'სამსახური',
    'უნივერსიტეტი',
    'სკოლა',
    'საბავშვო ბაღი',
    'სხვა ადგილი',
  ];

  readonly optionTranslations:
    Record<AppLanguage, Record<string, string>> = {
      ka: {},

      en: {
        'ვაკე': 'Vake',
        'საბურთალო': 'Saburtalo',
        'ვერა': 'Vera',
        'მთაწმინდა': 'Mtatsminda',
        'ჩუღურეთი': 'Chugureti',
        'დიდუბე': 'Didube',
        'ნაძალადევი': 'Nadzaladevi',
        'ისანი': 'Isani',
        'სამგორი': 'Samgori',
        'გლდანი': 'Gldani',
        'დიღომი': 'Dighomi',
        'დიდი დიღომი': 'Didi Dighomi',
        'ორთაჭალა': 'Ortachala',
        'ავლაბარი': 'Avlabari',

        'ახალი კორპუსი': 'New building',
        'ახალი რემონტი': 'New renovation',
        'პარკინგი': 'Parking',
        'აივანი': 'Balcony',
        'კონდიციონერი': 'Air conditioning',
        'პარკი ახლოს': 'Park Nearby',
        'წყნარი ქუჩა': 'Quiet street',
        'მეტროსთან ახლოს': 'Near metro',
        'კარგი ხედი': 'Good view',
        'სკოლა/ბაღი ახლოს': 'School/kindergarten nearby',

        'სამსახური': 'Work',
        'უნივერსიტეტი': 'University',
        'სკოლა': 'School',
        'საბავშვო ბაღი': 'Kindergarten',
        'სხვა ადგილი': 'Other place',

        'სასურველი უბანი': 'Preferred district',
        'ტრანსპორტთან სიახლოვე': 'Near public transport',
        'მეტროსთან სიახლოვე': 'Near metro',
        'ინფრასტრუქტურა': 'Infrastructure',
        'პარკთან/მწვანე სივრცესთან ახლოს':
          'Near a park / green space',

        'სამსახურთან ახლოს': 'Near work',
        'უნივერსიტეტთან ახლოს':
          'Near university',

        'სკოლასთან ახლოს':
          'Near school',

        'საბავშვო ბაღთან ახლოს':
          'Near kindergarten',

        'მნიშვნელოვან ადგილთან ახლოს':
          'Near an important place',
      },

      ru: {
        'ვაკე': 'Ваке',
        'საბურთალო': 'Сабуртало',
        'ვერა': 'Вера',
        'მთაწმინდა': 'Мтацминда',
        'ჩუღურეთი': 'Чугурети',
        'დიდუბე': 'Дидубе',
        'ნაძალადევი': 'Надзаладеви',
        'ისანი': 'Исани',
        'სამგორი': 'Самгори',
        'გლდანი': 'Глдани',
        'დიღომი': 'Дигоми',
        'დიდი დიღომი': 'Диди Дигоми',
        'ორთაჭალა': 'Ортачала',
        'ავლაბარი': 'Авлабари',

        'ახალი კორპუსი': 'Новостройка',
        'ახალი რემონტი': 'Новый ремонт',
        'პარკინგი': 'Парковка',
        'აივანი': 'Балкон',
        'კონდიციონერი': 'Кондиционер',
        'პარკი ახლოს':
          'Парк рядом',

        'წყნარი ქუჩა': 'Тихая улица',
        'მეტროსთან ახლოს': 'Рядом с метро',
        'კარგი ხედი': 'Хороший вид',
        'სკოლა/ბაღი ახლოს': 'Школа/сад рядом',

        'სამსახური': 'Работа',
        'უნივერსიტეტი': 'Университет',
        'სკოლა': 'Школа',
        'საბავშვო ბაღი': 'Детский сад',
        'სხვა ადგილი': 'Другое место',

        'სასურველი უბანი':
          'Предпочтительный район',

        'ტრანსპორტთან სიახლოვე':
          'Рядом с транспортом',

        'მეტროსთან სიახლოვე':
          'Рядом с метро',

        'ინფრასტრუქტურა':
          'Инфраструктура',

        'პარკთან/მწვანე სივრცესთან ახლოს':
          'Рядом с парком / зелёной зоной',

        'სამსახურთან ახლოს':
          'Рядом с работой',

        'უნივერსიტეტთან ახლოს':
          'Рядом с университетом',

        'სკოლასთან ახლოს':
          'Рядом со школой',

        'საბავშვო ბაღთან ახლოს':
          'Рядом с детским садом',

        'მნიშვნელოვან ადგილთან ახლოს':
          'Рядом с важным местом',
      },
    };

  locationEntries: LocationEntry[] = [];

  private locationId = 1;

  streetCatalogLoading = false;
  streetCatalogError = false;
  activeLocationEntryId: number | null = null;

  private streetCatalog: ApiLocation[] = [];
  private readonly locationStreetSuggestions = new Map<
    number,
    LocationSuggestion[]
  >();
  private readonly activeStreetSuggestionIndexes =
    new Map<number, number>();

  readonly basePriorities: PriorityItem[] = [
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
      label:
        'პარკთან/მწვანე სივრცესთან ახლოს',
      selected: false,
    },
  ];

  form = {
    nationality:
      '' as CountryCode | '',

    phoneCountry:
      'GE' as CountryCode,

    fullName:
      '',

    phoneNumber:
      '',

    preferredContactMethod:
      'phone',

    moveIn:
      '',

    budgetMin:
      null as number | null,

    budgetMax:
      null as number | null,

    flexibleBudget:
      false,

    districts:
      [] as string[],

    chooseDistrictForMe:
      false,

    bedrooms:
      '',

    minArea:
      null as number | null,

    household:
      '',

    peopleCount:
      null as number | null,

    hasChildren:
      null as boolean | null,

    childrenAges:
      [] as string[],

    petType:
      'none',

    petSize:
      '',

    otherPetType:
      '',

    petCount:
      1,

    requirements:
      [] as string[],

    locationTypes:
      [] as string[],

    rentalPeriod:
      '',

    priorities:
      [] as PriorityItem[],
  };

  constructor(
    private http: HttpClient,
    private route: ActivatedRoute,
    private locationService: LocationService,
    private translationService: TranslationService
  ) {}

  ngOnInit(): void {

    polyfillCountryFlagEmojis();

    const browserLanguage =
      (navigator.language || '')
        .toLowerCase();

    this.language =
      browserLanguage.startsWith('ru')
        ? 'ru'
        : browserLanguage.startsWith('en')
          ? 'en'
        : 'ka';

    this.syncGlobalLanguage();

    this.buildCountries();

    const routeValue =
      this.route.snapshot
        .paramMap
        .get('agentToken');

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
      normalizedRouteValue
        .substring('agent-'.length);

    if (!token) {
      this.invalidAgentLink = true;
      return;
    }

    this.agentToken = token;
    this.invalidAgentLink = false;

    this.loadStreetCatalog();
  }

  t(key: string): string {
    return (
      this.translations[this.language]?.[key] ??
      this.translations.ka[key] ??
      key
    );
  }

  translateOption(
    value: string
  ): string {
    if (this.language === 'ka') {
      return value;
    }

    return (
      this.optionTranslations[this.language]?.[value] ??
      value
    );
  }

  setLanguage(
    language: AppLanguage
  ): void {
    this.language = language;
    this.syncGlobalLanguage();
    this.buildCountries();
  }

  private syncGlobalLanguage(): void {
    this.translationService.setLanguage(
      this.language === 'ka' ? 'ka' : 'en'
    );
  }

  private countryFlag(
    code: string
  ): string {
    return code
      .toUpperCase()
      .replace(
        /./g,
        char =>
          String.fromCodePoint(
            127397 +
            char.charCodeAt(0)
          )
      );
  }

  private buildCountries(): void {
    const localeMap:
      Record<AppLanguage, string> = {
        ka: 'ka',
        en: 'en',
        ru: 'ru',
      };

    let displayNames:
      Intl.DisplayNames;

    try {
      displayNames =
        new Intl.DisplayNames(
          [localeMap[this.language]],
          {
            type: 'region',
          }
        );
    } catch {
      displayNames =
        new Intl.DisplayNames(
          ['en'],
          {
            type: 'region',
          }
        );
    }

    this.countries =
      getCountries()
        .map(code => ({
          code,

          name:
            displayNames.of(code) ??
            code,

          flag:
            this.countryFlag(code),

          callingCode:
            `+${getCountryCallingCode(code)}`,
        }))
        .sort(
          (a, b) =>
            a.name.localeCompare(
              b.name,
              localeMap[this.language]
            )
        );
  }

  get filteredCountries():
    CountryOption[] {
    const search =
      this.countrySearch
        .trim()
        .toLowerCase();

    if (!search) {
      return this.countries;
    }

    return this.countries.filter(
      country =>
        country.name
          .toLowerCase()
          .includes(search) ||

        country.code
          .toLowerCase()
          .includes(search) ||

        country.callingCode
          .includes(search)
    );
  }

  get filteredPhoneCountries():
    CountryOption[] {
    const search =
      this.phoneCountrySearch
        .trim()
        .toLowerCase();

    if (!search) {
      return this.countries;
    }

    return this.countries.filter(
      country =>
        country.name
          .toLowerCase()
          .includes(search) ||

        country.code
          .toLowerCase()
          .includes(search) ||

        country.callingCode
          .includes(search)
    );
  }

  get selectedCountry():
    CountryOption | null {
    if (!this.form.nationality) {
      return null;
    }

    return (
      this.countries.find(
        country =>
          country.code ===
          this.form.nationality
      ) ??
      null
    );
  }

  get selectedPhoneCountry():
    CountryOption | null {
    return (
      this.countries.find(
        country =>
          country.code ===
          this.form.phoneCountry
      ) ??
      null
    );
  }

  selectNationality(
    country: CountryOption
  ): void {
    this.form.nationality =
      country.code;

    this.form.phoneCountry =
      country.code;

    this.countryDropdownOpen =
      false;

    this.phoneCountryDropdownOpen =
      false;

    this.countrySearch =
      '';

    this.phoneCountrySearch =
      '';

    this.form.phoneNumber =
      '';
  }

  selectPhoneCountry(
    country: CountryOption
  ): void {
    this.form.phoneCountry =
      country.code;

    this.phoneCountryDropdownOpen =
      false;

    this.phoneCountrySearch =
      '';

    this.form.phoneNumber =
      '';
  }

  get progress(): number {
    return (
      this.currentStep /
      this.totalSteps
    ) * 100;
  }

  get selectedPriorities():
    PriorityItem[] {
    return this.form.priorities
      .filter(
        item =>
          item.selected
      );
  }

  get availablePriorities():
    PriorityItem[] {
    return this.form.priorities;
  }

  get canContinue(): boolean {

  switch (this.currentStep) {

    /*
     * STEP 1
     * Nationality + name + phone
     */
    case 1:
      return (
        !!this.form.nationality &&
        this.form.fullName.trim().length >= 2 &&
        this.isPhoneValid()
      );


    /*
     * STEP 2
     * Move in
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
     * District
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
        (
          this.form.household === 'family' ||
          this.form.household === 'friends'
        ) &&
        (
          this.form.peopleCount === null ||
          this.form.peopleCount < 1
        )
      ) {
        return false;
      }

      if (this.form.household === 'family') {

        if (this.form.hasChildren === null) {
          return false;
        }

        if (
          this.form.hasChildren === true &&
          this.form.childrenAges.length === 0
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
      return (
        !!this.form.petType &&
        (
          this.form.petType === 'none' ||
          (
            this.form.petCount >= 1 &&
            (
              this.form.petType !== 'dog' ||
              !!this.form.petSize
            ) &&
            (
              this.form.petType !== 'other' ||
              !!this.form.otherPetType.trim()
            )
          )
        )
      );


    /*
     * STEP 8
     * Requirements
     */
    case 8:
      return true;


    /*
     * STEP 9
     * Locations
     */
    case 9:
      return this.locationEntries.every(
        entry =>
          entry.address.trim().length > 0
      );


    /*
     * STEP 10
     * Rental period
     */
    case 10:
      return !!this.form.rentalPeriod;


    /*
     * STEP 11
     * Priorities
     */
    case 11:
      return this.selectedPriorities.length === 5;


    default:
      return true;
  }
}

  nextStep(): void {
    if (
      !this.canContinue ||
      this.currentStep >=
        this.totalSteps
    ) {
      return;
    }

    this.currentStep++;

    if (
      this.currentStep === 11
    ) {
      this.buildPriorities();
    }

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  previousStep(): void {
    if (
      this.currentStep <= 1
    ) {
      return;
    }

    this.currentStep--;

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    });
  }

  /* ==========================================
     PHONE — STRICT COUNTRY-AWARE VALIDATION
  ========================================== */

  private getPhoneDigits(): string {
    return String(
      this.form.phoneNumber || ''
    ).replace(/\D/g, '');
  }

  allowPhoneNumberKey(
    event: KeyboardEvent
  ): void {
    if (
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      event.key.length !== 1 ||
      /\d/.test(event.key)
    ) {
      return;
    }

    event.preventDefault();
  }


  /**
   * Runs on every phone input change.
   *
   * - Digits only
   * - Uses the currently selected country
   * - Prevents typing beyond that country's maximum possible
   *   national-number length
   * - Does NOT use one global 9/10/11 digit rule
   */
  onPhoneInput(
    event: Event
  ): void {
    this.phoneCountryDropdownOpen =
      false;

    this.phoneCountrySearch =
      '';

    const input =
      event.target as HTMLInputElement;

    let digits =
      String(input.value || '')
        .replace(/\D/g, '');

    /*
     * Absolute safety ceiling.
     * The country-specific logic below is stricter.
     */
    digits =
      digits.slice(0, 15);

    /*
     * validatePhoneNumberLength() knows the possible lengths
     * for the selected country's numbering plan.
     *
     * Example:
     * US (+1) national number -> 10 digits.
     * If the user tries an 11th/12th digit it becomes TOO_LONG
     * and we immediately remove the extra digit.
     *
     * Some countries legitimately have several possible lengths,
     * so INVALID_LENGTH is NOT treated as "too long" while typing.
     * Only TOO_LONG is truncated.
     */
    if (this.form.phoneCountry) {
      while (digits.length > 0) {
        const lengthResult =
          validatePhoneNumberLength(
            digits,
            this.form.phoneCountry
          );

        if (lengthResult !== 'TOO_LONG') {
          break;
        }

        digits =
          digits.slice(0, -1);
      }
    }

    this.form.phoneNumber =
      digits;

    input.value =
      digits;
  }


  /**
   * Gives the current length-state for the selected country.
   * undefined = length is possible.
   */
  getPhoneLengthError():
    | 'NOT_A_NUMBER'
    | 'INVALID_COUNTRY'
    | 'TOO_SHORT'
    | 'TOO_LONG'
    | 'INVALID_LENGTH'
    | null {

    const digits =
      this.getPhoneDigits();

    if (
      !digits ||
      !this.form.phoneCountry
    ) {
      return null;
    }

    const result =
      validatePhoneNumberLength(
        digits,
        this.form.phoneCountry
      );

    return (result ?? null) as
      | 'NOT_A_NUMBER'
      | 'INVALID_COUNTRY'
      | 'TOO_SHORT'
      | 'TOO_LONG'
      | 'INVALID_LENGTH'
      | null;
  }


  /**
   * Strict final validation.
   *
   * isPossible() validates country-specific possible lengths.
   * isValid() validates the actual number pattern using MAX metadata.
   *
   * This rejects things such as:
   * - US +1 with 12 national digits
   * - numbers that are too short for the selected country
   * - numbers that have a possible length but invalid digit pattern
   * - numbers that actually belong to another country sharing
   *   the same calling code
   */
  isPhoneValid(): boolean {
    const digits =
      this.getPhoneDigits();

    if (
      !digits ||
      !this.form.phoneCountry
    ) {
      return false;
    }

    const lengthResult =
      validatePhoneNumberLength(
        digits,
        this.form.phoneCountry
      );

    /*
     * TOO_SHORT / TOO_LONG / INVALID_LENGTH etc.
     */
    if (lengthResult) {
      return false;
    }

    try {
      const phone =
        parsePhoneNumberFromString(
          digits,
          {
            defaultCountry:
              this.form.phoneCountry,

            /*
             * Don't extract a phone number from random text.
             * Treat the whole value as the number.
             */
            extract: false,
          }
        );

      if (!phone) {
        return false;
      }

      /*
       * Important for shared calling codes such as +1.
       * If a selected-country national number resolves to another
       * country, do not accept it as the selected country.
       */
      if (
        phone.country &&
        phone.country !==
          this.form.phoneCountry
      ) {
        return false;
      }

      return (
        phone.isPossible() &&
        phone.isValid()
      );

    } catch {
      return false;
    }
  }


  private getFormattedPhone():
    string | null {

    const digits =
      this.getPhoneDigits();

    if (
      !digits ||
      !this.form.phoneCountry
    ) {
      return null;
    }

    const lengthResult =
      validatePhoneNumberLength(
        digits,
        this.form.phoneCountry
      );

    if (lengthResult) {
      return null;
    }

    try {
      const phone =
        parsePhoneNumberFromString(
          digits,
          {
            defaultCountry:
              this.form.phoneCountry,
            extract: false,
          }
        );

      if (!phone) {
        return null;
      }

      if (
        phone.country &&
        phone.country !==
          this.form.phoneCountry
      ) {
        return null;
      }

      if (
        !phone.isPossible() ||
        !phone.isValid()
      ) {
        return null;
      }

      /*
       * Save/send standard E.164 format:
       * GE -> +995555123456
       * US -> +12133734253
       * GB -> +447911123456
       */
      return phone.number;

    } catch {
      return null;
    }
  }


  selectMoveIn(
    value: string
  ): void {
    this.form.moveIn =
      value;
  }

  toggleDistrict(
  district: {
    id: string;
    ka: string;
    en: string;
    ru: string;
  }
): void {

  this.form.chooseDistrictForMe = false;

  const index =
    this.form.districts.indexOf(
      district.id
    );

  if (index >= 0) {
    this.form.districts.splice(
      index,
      1
    );
  } else {
    this.form.districts.push(
      district.id
    );
  }
}

  toggleChooseDistrictForMe():
    void {
    this.form.chooseDistrictForMe =
      !this.form.chooseDistrictForMe;

    if (
      this.form.chooseDistrictForMe
    ) {
      this.form.districts =
        [];
    }
  }

  isDistrictSelected(
  district: {
    id: string;
    ka: string;
    en: string;
    ru: string;
  }
): boolean {

  return this.form.districts.includes(
    district.id
  );
}

  selectBedrooms(
    value: string
  ): void {
    this.form.bedrooms =
      value;
  }

  selectHousehold(
    value: string
  ): void {
    this.form.household =
      value;

    if (
      value === 'alone' ||
      value === 'couple'
    ) {
      this.form.peopleCount =
        null;
    }

    if (
      value !== 'family'
    ) {
      this.form.hasChildren =
        null;

      this.form.childrenAges =
        [];
    }
  }

  toggleChildAge(
    value: string
  ): void {
    const index =
      this.form.childrenAges.indexOf(
        value
      );

    if (index >= 0) {
      this.form.childrenAges.splice(
        index,
        1
      );
    } else {
      this.form.childrenAges.push(
        value
      );
    }
  }

  isChildAgeSelected(
    value: string
  ): boolean {
    return this.form.childrenAges.includes(
      value
    );
  }


  selectPet(
    value: string
  ): void {
    this.form.petType =
      value;

    if (
      value !== 'dog'
    ) {
      this.form.petSize =
        '';
    }

    if (
      value !== 'other'
    ) {
      this.form.otherPetType =
        '';
    }

    if (
      value === 'none'
    ) {
      this.form.petCount =
        1;
    }
  }

  toggleRequirement(
    value: string
  ): void {
    const index =
      this.form.requirements
        .indexOf(value);

    if (
      index >= 0
    ) {
      this.form.requirements
        .splice(
          index,
          1
        );
    } else {
      if (
        this.form.requirements.length >= 4
      ) {
        return;
      }

      this.form.requirements
        .push(
          value
        );
    }
  }

  isRequirementSelected(
    value: string
  ): boolean {
    return (
      this.form.requirements
        .includes(value)
    );
  }

  toggleLocationType(
    type: string
  ): void {
    const index =
      this.form.locationTypes
        .indexOf(type);

    if (
      index >= 0
    ) {
      this.form.locationTypes
        .splice(
          index,
          1
        );

      const removedEntries =
        this.locationEntries
          .filter(
            entry =>
              entry.type ===
              type
          );

      removedEntries.forEach(
        entry => {
          this.locationStreetSuggestions
            .delete(entry.id);

          this.activeStreetSuggestionIndexes
            .delete(entry.id);
        }
      );

      if (
        removedEntries.some(
          entry =>
            entry.id ===
            this.activeLocationEntryId
        )
      ) {
        this.activeLocationEntryId =
          null;
      }

      this.locationEntries =
        this.locationEntries
          .filter(
            entry =>
              entry.type !==
              type
          );
    } else {
      this.form.locationTypes
        .push(type);

      this.addLocation(
        type
      );
    }
  }

  isLocationSelected(
    type: string
  ): boolean {
    return (
      this.form.locationTypes
        .includes(
          type
        )
    );
  }

  addLocation(
    type: string
  ): void {
    this.locationEntries.push({
      id:
        this.locationId++,

      type,

      address:
        '',

      streetId:
        null,

      streetValue:
        '',

      streetLabel:
        '',

      district:
        '',
    });
  }

  removeLocation(
    entry: LocationEntry
  ): void {
    const sameTypeEntries =
      this.locationEntries
        .filter(
          item =>
            item.type ===
            entry.type
        );

    if (
      sameTypeEntries.length <= 1
    ) {
      return;
    }

    this.locationEntries =
      this.locationEntries
        .filter(
          item =>
            item.id !==
            entry.id
        );

    this.locationStreetSuggestions
      .delete(entry.id);

    this.activeStreetSuggestionIndexes
      .delete(entry.id);

    if (
      this.activeLocationEntryId ===
      entry.id
    ) {
      this.activeLocationEntryId =
        null;
    }
  }

  clearLocations():
    void {
    this.form.locationTypes =
      [];

    this.locationEntries =
      [];

    this.locationStreetSuggestions
      .clear();

    this.activeStreetSuggestionIndexes
      .clear();

    this.closeLocationAutocomplete();
  }

  onLocationAddressFocus(
    entry: LocationEntry
  ): void {
    if (
      !!entry.streetValue &&
      this.addressKeepsSelectedStreet(
        entry
      )
    ) {
      this.closeLocationAutocomplete();

      return;
    }

    this.activeLocationEntryId =
      entry.id;

    this.refreshStreetSuggestions(
      entry
    );
  }

  onLocationAddressInput(
    entry: LocationEntry
  ): void {
    if (
      !!entry.streetValue
    ) {
      if (
        this.addressKeepsSelectedStreet(
          entry
        )
      ) {
        this.closeLocationAutocomplete();

        return;
      }

      this.clearSelectedStreet(
        entry
      );
    }

    this.activeLocationEntryId =
      entry.id;

    this.refreshStreetSuggestions(
      entry
    );
  }

  closeLocationAutocomplete():
    void {
    this.activeLocationEntryId =
      null;

    this.activeStreetSuggestionIndexes
      .clear();
  }

  showStreetAutocomplete(
    entry: LocationEntry
  ): boolean {
    return (
      this.activeLocationEntryId ===
        entry.id &&
      !(
        !!entry.streetValue &&
        this.addressKeepsSelectedStreet(
          entry
        )
      ) &&
      this.streetQuery(
        entry.address
      ).length >= 2
    );
  }

  streetSuggestionsFor(
    entry: LocationEntry
  ): LocationSuggestion[] {
    return (
      this.locationStreetSuggestions
        .get(entry.id) ??
      []
    );
  }

  selectStreetSuggestion(
    entry: LocationEntry,
    suggestion: LocationSuggestion
  ): void {
    const addressSuffix =
      this.streetAddressSuffixForSuggestion(
        entry.address,
        suggestion
      );

    entry.address =
      `${suggestion.label}${addressSuffix}`;

    entry.streetId =
      suggestion.id ??
      null;

    entry.streetValue =
      suggestion.value ??
      suggestion.label;

    entry.streetLabel =
      suggestion.label;

    entry.district =
      suggestion.districtValue ??
      suggestion.district ??
      '';

    this.locationStreetSuggestions
      .delete(entry.id);

    this.closeLocationAutocomplete();
  }

  onLocationAddressKeydown(
    entry: LocationEntry,
    event: KeyboardEvent
  ): void {
    if (
      event.key ===
      'Escape'
    ) {
      this.closeLocationAutocomplete();

      return;
    }

    if (
      !this.showStreetAutocomplete(
        entry
      )
    ) {
      return;
    }

    const suggestions =
      this.streetSuggestionsFor(
        entry
      );

    if (!suggestions.length) {
      return;
    }

    const currentIndex =
      this.activeStreetSuggestionIndexes
        .get(entry.id) ??
      -1;

    if (
      event.key ===
        'ArrowDown' ||
      event.key ===
        'ArrowUp'
    ) {
      event.preventDefault();

      const direction =
        event.key ===
        'ArrowDown'
          ? 1
          : -1;

      const nextIndex =
        currentIndex < 0
          ? direction > 0
            ? 0
            : suggestions.length - 1
          : (
              currentIndex +
              direction +
              suggestions.length
            ) %
            suggestions.length;

      this.activeStreetSuggestionIndexes
        .set(
          entry.id,
          nextIndex
        );

      window.requestAnimationFrame(
        () =>
          document
            .getElementById(
              this.streetSuggestionId(
                entry,
                nextIndex
              )
            )
            ?.scrollIntoView({
              block:
                'nearest',
            })
      );

      return;
    }

    if (
      event.key ===
        'Enter' &&
      currentIndex >= 0
    ) {
      event.preventDefault();

      this.selectStreetSuggestion(
        entry,
        suggestions[currentIndex]
      );
    }
  }

  onLocationAutocompleteFocusOut(
    entry: LocationEntry,
    event: FocusEvent
  ): void {
    const container =
      event.currentTarget instanceof HTMLElement
        ? event.currentTarget
        : null;

    const nextTarget =
      event.relatedTarget instanceof Node
        ? event.relatedTarget
        : null;

    if (
      container &&
      nextTarget &&
      container.contains(
        nextTarget
      )
    ) {
      return;
    }

    if (
      this.activeLocationEntryId ===
      entry.id
    ) {
      this.closeLocationAutocomplete();
    }
  }

  streetSuggestionId(
    entry: LocationEntry,
    index: number
  ): string {
    return `street-suggestion-${entry.id}-${index}`;
  }

  activeStreetSuggestionId(
    entry: LocationEntry
  ): string | null {
    const index =
      this.activeStreetSuggestionIndexes
        .get(entry.id) ??
      -1;

    return index >= 0
      ? this.streetSuggestionId(
          entry,
          index
        )
      : null;
  }

  isStreetSuggestionActive(
    entry: LocationEntry,
    index: number
  ): boolean {
    return (
      this.activeStreetSuggestionIndexes
        .get(entry.id) ===
      index
    );
  }

  @HostListener(
    'document:pointerdown',
    ['$event']
  )
  closeLocationAutocompleteOnOutsideClick(
    event: PointerEvent
  ): void {
    if (
      event.target instanceof Element &&
      event.target.closest(
        '.location-autocomplete'
      )
    ) {
      return;
    }

    this.closeLocationAutocomplete();
  }

  private loadStreetCatalog():
    void {
    this.streetCatalogLoading =
      true;

    this.streetCatalogError =
      false;

    this.locationService
      .getLocations()
      .subscribe({
        next: locations => {
          this.streetCatalog =
            locations;

          this.streetCatalogLoading =
            false;

          const activeEntry =
            this.locationEntries
              .find(
                entry =>
                  entry.id ===
                  this.activeLocationEntryId
              );

          if (activeEntry) {
            this.refreshStreetSuggestions(
              activeEntry
            );
          }
        },

        error: () => {
          this.streetCatalogLoading =
            false;

          this.streetCatalogError =
            true;
        },
      });
  }

  private refreshStreetSuggestions(
    entry: LocationEntry
  ): void {
    const query =
      this.streetQuery(
        entry.address
      );

    if (
      query.length < 2 ||
      this.streetCatalogLoading ||
      this.streetCatalogError
    ) {
      this.locationStreetSuggestions
        .delete(entry.id);

      this.activeStreetSuggestionIndexes
        .delete(entry.id);

      return;
    }

    const normalizedQuery =
      this.normalizedStreetText(
        query
      );

    const language =
      /[\u10A0-\u10FF]/
        .test(query)
        ? 'ka'
        : 'en';

    const seen =
      new Set<string>();

    const matches: Array<{
      suggestion: LocationSuggestion;
      rank: number;
    }> = [];

    const locations =
      this.streetCatalog
        .filter(
          location =>
            location.city
              .trim()
              .toLowerCase() ===
            'tbilisi'
        )
        .sort(
          (left, right) =>
            Number(
              left.district ===
              'All Tbilisi'
            ) -
            Number(
              right.district ===
              'All Tbilisi'
            )
        );

    for (
      const location
      of locations
    ) {
      for (
        const street
        of this.locationService
          .streetNames(
            location,
            language
          )
      ) {
        const key =
          street.id > 0
            ? `id:${street.id}`
            : `name:${
                this.normalizedStreetText(
                  street.value
                )
              }`;

        if (seen.has(key)) {
          continue;
        }

        const normalizedLabel =
          this.normalizedStreetText(
            street.label
          );

        const normalizedValue =
          this.normalizedStreetText(
            street.value
          );

        const normalizedAliases =
          street.aliases
            .map(
              alias =>
                this.normalizedStreetText(
                  alias
                )
            );

        const labelIndex =
          normalizedLabel
            .indexOf(
              normalizedQuery
            );

        const valueIndex =
          normalizedValue
            .indexOf(
              normalizedQuery
            );

        const aliasIndexes =
          normalizedAliases
            .map(
              alias =>
                alias.indexOf(
                  normalizedQuery
                )
            )
            .filter(
              index =>
                index >= 0
            );

        const aliasIndex =
          aliasIndexes.length
            ? Math.min(
                ...aliasIndexes
              )
            : -1;

        if (
          labelIndex < 0 &&
          valueIndex < 0 &&
          aliasIndex < 0
        ) {
          continue;
        }

        seen.add(key);

        matches.push({
          rank:
            labelIndex === 0
              ? 0
              : valueIndex === 0
                ? 1
                : normalizedAliases
                    .some(
                      alias =>
                        alias.startsWith(
                          normalizedQuery
                        )
                    )
                  ? 2
                  : Math.min(
                      labelIndex < 0
                        ? Number.MAX_SAFE_INTEGER
                        : labelIndex,
                      valueIndex < 0
                        ? Number.MAX_SAFE_INTEGER
                        : valueIndex,
                      aliasIndex < 0
                        ? Number.MAX_SAFE_INTEGER
                        : aliasIndex
                    ) + 3,

          suggestion: {
            id:
              street.id ||
              undefined,

            label:
              street.label,

            value:
              street.value,

            aliases:
              street.aliases,

            type:
              'Street',

            city:
              this.locationService
                .cityName(
                  location,
                  language
                ),

            district:
              this.locationService
                .districtName(
                  location,
                  language
                ),

            districtValue:
              location.district,
          },
        });
      }
    }

    const suggestions =
      matches
        .sort(
          (left, right) =>
            left.rank -
              right.rank ||
            left.suggestion.label
              .localeCompare(
                right.suggestion.label
              )
        )
        .slice(0, 8)
        .map(
          match =>
            match.suggestion
        );

    this.locationStreetSuggestions
      .set(
        entry.id,
        suggestions
      );

    this.activeStreetSuggestionIndexes
      .set(
        entry.id,
        -1
      );
  }

  private addressKeepsSelectedStreet(
    entry: LocationEntry
  ): boolean {
    const address =
      this.normalizedStreetText(
        entry.address
      );

    const label =
      this.normalizedStreetText(
        entry.streetLabel
      );

    return (
      !!label &&
      (
        address === label ||
        (
          address.startsWith(
            label
          ) &&
          /^(?:,\s*|\s+)(?:#|№)?\d/
            .test(
              address.slice(
                label.length
              )
            )
        )
      )
    );
  }

  private clearSelectedStreet(
    entry: LocationEntry
  ): void {
    entry.streetId =
      null;

    entry.streetValue =
      '';

    entry.streetLabel =
      '';

    entry.district =
      '';
  }

  private streetQuery(
    address: string
  ): string {
    const trimmedAddress =
      address.trim();

    const suffix =
      this.streetAddressSuffix(
        trimmedAddress
      );

    return suffix
      ? trimmedAddress
          .slice(
            0,
            -suffix.length
          )
          .trim()
      : trimmedAddress;
  }

  private streetAddressSuffix(
    address: string
  ): string {
    return (
      address
        .trim()
        .match(
          /((?:,\s*|\s+)(?:#|№)?\d[a-zа-я\u10a0-\u10ff0-9/-]*(?:\s*,.*)?)$/i
        )?.[1] ??
      ''
    );
  }

  private streetAddressSuffixForSuggestion(
    address: string,
    suggestion: LocationSuggestion
  ): string {
    const trimmedAddress =
      address.trim();

    const normalizedAddress =
      this.normalizedStreetText(
        trimmedAddress
      );

    const candidateNames =
      [
        suggestion.label,
        suggestion.value,
        ...(suggestion.aliases ?? []),
      ]
        .filter(
          (value): value is string =>
            !!value
        )
        .map(
          value =>
            this.normalizedStreetText(
              value
            )
        );

    if (
      candidateNames.includes(
        normalizedAddress
      )
    ) {
      return '';
    }

    const suffix =
      this.streetAddressSuffix(
        trimmedAddress
      );

    if (!suffix) {
      return '';
    }

    const baseAddress =
      this.normalizedStreetText(
        trimmedAddress.slice(
          0,
          -suffix.length
        )
      );

    return (
      !!baseAddress &&
      candidateNames.some(
        name =>
          name.includes(
            baseAddress
          ) ||
          baseAddress.includes(
            name
          )
      )
    )
      ? suffix
      : '';
  }

  private normalizedStreetText(
    value: string
  ): string {
    return value
      .trim()
      .normalize('NFC')
      .toLocaleLowerCase();
  }

  selectRentalPeriod(
    value: string
  ): void {
    this.form.rentalPeriod =
      value;
  }

  buildPriorities():
    void {
    const oldSelectedIds =
      this.selectedPriorities
        .map(
          item =>
            item.id
        );

    const priorities:
      PriorityItem[] =
      this.basePriorities
        .map(
          item => ({
            ...item,

            selected:
              oldSelectedIds
                .includes(
                  item.id
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

    this.form.locationTypes
      .forEach(
        type => {
          const label =
            locationLabels[type] ??
            `${type}-თან ახლოს`;

          const id =
            `location-${type}`;

          if (
            !priorities.some(
              item =>
                item.id === id
            )
          ) {
            priorities.push({
              id,
              label,

              selected:
                oldSelectedIds
                  .includes(id),
            });
          }
        }
      );

    this.form.requirements
      .forEach(
        requirement => {
          const id =
            `requirement-${requirement}`;

          if (
            !priorities.some(
              item =>
                item.id === id ||
                item.label
                  .toLowerCase() ===
                requirement
                  .toLowerCase()
            )
          ) {
            priorities.push({
              id,

              label:
                requirement,

              selected:
                oldSelectedIds
                  .includes(id),
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
    if (
      item.selected
    ) {
      item.selected =
        false;

      return;
    }

    if (
      this.selectedPriorities
        .length >= 5
    ) {
      return;
    }

    item.selected =
      true;
  }

  dragStart(
    item: PriorityItem
  ): void {
    if (
      !item.selected
    ) {
      return;
    }

    this.draggingPriority =
      item;
  }

  dragEnd():
    void {
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
      this.form.priorities
        .filter(
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

  private convertBedroomsToNumber():
    number | null {
    if (
      !this.form.bedrooms
    ) {
      return null;
    }

    if (
      this.form.bedrooms ===
      'Studio'
    ) {
      return 0;
    }

    if (
      this.form.bedrooms ===
      '4+'
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
      questionnaireVersion:
        4,

      language:
        this.language,

      nationality: {
        countryCode:
          this.form.nationality ||
          null,

        countryName:
          this.selectedCountry
            ?.name ??
          null,

        callingCode:
          this.selectedCountry
            ?.callingCode ??
          null,

        flag:
          this.selectedCountry
            ?.flag ??
          null,
      },

      phoneCountry: {
        countryCode:
          this.form.phoneCountry,

        countryName:
          this.selectedPhoneCountry
            ?.name ??
          null,

        callingCode:
          this.selectedPhoneCountry
            ?.callingCode ??
          null,
      },

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

        otherType:
          this.form.otherPetType.trim() || undefined,

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

            streetId:
              location.streetId,

            street:
              location.streetValue ||
              null,

            district:
              location.district ||
              null,
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

  submitQuestionnaire():
    void {
    if (
      this.currentStep !== 11 ||
      this.selectedPriorities
        .length !== 5 ||
      this.isSubmitting
    ) {
      return;
    }

    if (
      !this.agentToken
    ) {
      this.submitError =
        this.language === 'en'
          ? 'The questionnaire link is invalid or is not connected to an agent.'
          : this.language === 'ru'
            ? 'Ссылка анкеты недействительна или не связана с агентом.'
            : 'ქვიზის ბმული არასწორია ან აგენტთან არ არის დაკავშირებული.';

      return;
    }

    const formattedPhone =
      this.getFormattedPhone();

    if (
      !formattedPhone
    ) {
      this.submitError =
        this.t(
          'invalidPhone'
        );

      return;
    }

    this.isSubmitting =
      true;

    this.submitSuccess =
      false;

    this.submitError =
      '';

    const submitUrl =
      `${this.apiBaseUrl}/questionnaire-leads/${encodeURIComponent(this.agentToken)}`;

    const payload:
      CrmLeadRequest = {
        fullName:
          this.form.fullName
            .trim(),

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
            : [
                ...this.form.districts,
              ],

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

    this.http
      .post(
        submitUrl,
        payload,
        {
          responseType:
            'text',
        }
      )
      .subscribe({
        next:
          response => {
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
              behavior:
                'smooth',
            });
          },

        error:
          error => {
            console.error(
              'CRM API ERROR:',
              error
            );

            this.isSubmitting =
              false;

            this.submitSuccess =
              false;

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
                    this.t(
                      'errorTitle'
                    );

                  return;
                }

                if (
                  parsed?.message
                ) {
                  this.submitError =
                    parsed.message;

                  return;
                }

                if (
                  parsed?.title
                ) {
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
              this.t(
                'errorTitle'
              );
          },
      });
  }
}
