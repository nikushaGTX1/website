import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { finalize } from 'rxjs';
import { API_URL } from '../utils/api-config';
import { CrmVacancyPosition } from '../models/crm';

interface CareerApplicationForm {
  fullName: string;
  phoneNumber: string;
  position: string;
  experience: string;
  languages: string;
}

@Component({
  selector: 'app-careers',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './careers.html',
  styleUrl: './careers.css',
})
export class Careers {
  @ViewChild('fileInput') private fileInput?: ElementRef<HTMLInputElement>;

  positions: CrmVacancyPosition[] = [];
  loadingPositions = true;
  readonly experienceOptions = ['No experience', 'Less than 1 year', '1–2 years', '3–5 years', '5+ years'];
  readonly maximumFileSize = 5 * 1024 * 1024;
  readonly acceptedExtensions = ['pdf', 'doc', 'docx'];

  form: CareerApplicationForm = this.emptyForm();
  cvFile: File | null = null;
  submitting = false;
  submitted = false;
  errorMessage = '';

  constructor(private http: HttpClient) {
    this.http.get<CrmVacancyPosition[]>(`${API_URL}/Crm/vacancy-positions`).subscribe({
      next: (positions) => {
        this.positions = positions;
        this.loadingPositions = false;
      },
      error: () => {
        this.loadingPositions = false;
        this.errorMessage = 'Open positions could not be loaded. Please try again later.';
      },
    });
  }

  chooseFile(): void {
    this.fileInput?.nativeElement.click();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.setFile(input.files?.[0] || null);
  }

  onFileDropped(event: DragEvent): void {
    event.preventDefault();
    this.setFile(event.dataTransfer?.files?.[0] || null);
  }

  allowFileDrop(event: DragEvent): void {
    event.preventDefault();
  }

  submit(): void {
    if (this.submitting) return;
    this.errorMessage = '';
    const fullName = this.form.fullName.trim();
    const phoneNumber = this.form.phoneNumber.trim();

    if (!fullName || !phoneNumber || !this.form.position || !this.form.experience) {
      this.errorMessage = 'Please complete all required fields.';
      return;
    }

    const body = new FormData();
    body.set('fullName', fullName);
    body.set('phoneNumber', phoneNumber);
    body.set('position', this.form.position);
    body.set('experience', this.form.experience);
    if (this.form.languages.trim()) body.set('languages', this.form.languages.trim());
    if (this.cvFile) body.set('cv', this.cvFile, this.cvFile.name);

    this.submitting = true;
    this.http.post(`${API_URL}/Crm/job-applications`, body).pipe(
      finalize(() => (this.submitting = false)),
    ).subscribe({
      next: () => {
        this.submitted = true;
        this.form = this.emptyForm();
        this.cvFile = null;
        if (this.fileInput) this.fileInput.nativeElement.value = '';
      },
      error: () => {
        this.errorMessage = 'Your application could not be sent. Please try again.';
      },
    });
  }

  private setFile(file: File | null): void {
    this.errorMessage = '';
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!this.acceptedExtensions.includes(extension)) {
      this.errorMessage = 'Upload a PDF, DOC or DOCX file.';
      return;
    }
    if (file.size > this.maximumFileSize) {
      this.errorMessage = 'The CV file must be 5 MB or smaller.';
      return;
    }
    this.cvFile = file;
  }

  private emptyForm(): CareerApplicationForm {
    return { fullName: '', phoneNumber: '', position: '', experience: '', languages: '' };
  }
}
