import { TestBed, inject } from '@angular/core/testing';
import {
  HttpClientTestingModule,
  HttpTestingController
} from '@angular/common/http/testing';
import { HTTP_INTERCEPTORS, HttpClient } from '@angular/common/http';
import { OAuthService } from 'angular-oauth2-oidc';
import { TokenInterceptor } from './token.interceptor';
import { Router } from '@angular/router';

const OAuthServiceMock = {
  getIdToken: () => {
    return 'token';
  },
  initImplicitFlow: () => jasmine.createSpy()
};
const RouterMock = {
  navigateByUrl() {
    return Promise.resolve(true);
  }
};
let store = {};
const mockSessionStorage = {
  getItem: (key: string): string => {
    return key in store ? store[key] : null;
  },
  setItem: (key: string, value: string) => {
    store[key] = `${value}`;
    mockSessionStorage[key] = `${value}`;
  },
  removeItem: (key: string) => {
    delete store[key];
    delete mockSessionStorage[key];
  },
  clear: () => {
    store = {};
    for (const key in mockSessionStorage) {
      if (
        mockSessionStorage.hasOwnProperty(key) &&
        typeof mockSessionStorage[key] !== 'function'
      ) {
        mockSessionStorage[key] = undefined;
      }
    }
  }
};

describe('TokenInterceptor', () => {
  let httpClientMock: HttpTestingController;
  let http: HttpClient;

  beforeEach(() => {
    spyOn(sessionStorage, 'getItem').and.callFake(mockSessionStorage.getItem);
    spyOn(sessionStorage, 'setItem').and.callFake(mockSessionStorage.setItem);
    spyOn(sessionStorage, 'removeItem').and.callFake(
      mockSessionStorage.removeItem
    );
    spyOn(sessionStorage, 'clear').and.callFake(mockSessionStorage.clear);
    spyOn(RouterMock, 'navigateByUrl');

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        { provide: HTTP_INTERCEPTORS, useClass: TokenInterceptor, multi: true },
        { provide: OAuthService, useValue: OAuthServiceMock },
        { provide: Router, useValue: RouterMock }
      ]
    });

    httpClientMock = TestBed.get(HttpTestingController);
    http = TestBed.get(HttpClient);
  });

  it('should add Authorization header to request', () => {
    // given
    http.get('/api').subscribe(response => expect(response).toBeTruthy());
    const request = httpClientMock.expectOne('/api');

    // then
    expect(request.request.headers.get('Authorization')).toBeTruthy();
    expect(request.request.headers.get('Authorization')).toBe('Bearer token');

    // when
    request.flush({ data: 'test' });
  });

  it('shouldnt add Authorization header to request', () => {
    // given
    const dexurl = 'https://dex.kyma.local/something-else';
    http.get(dexurl).subscribe(response => expect(response).toBeTruthy());
    const request = httpClientMock.expectOne(dexurl);

    // then
    expect(request.request.headers.get('Authorization')).toBeNull();

    // when
    request.flush({});
  });

  describe('401 Unauthorized', () => {
    const currDate = 1538040400000;
    const newToken = 1538040400000 - 1000;
    const olderToken = 1538040400000 - 50000;

    it('fresh token sets requestError and navigates to /requestError', () => {
      spyOn(Date, 'now').and.callFake(() => {
        return currDate;
      });
      sessionStorage.setItem('id_token_stored_at', newToken.toString());

      // given
      http.get('/api').subscribe(
        response => {},
        error => {
          // then
          expect(error).toBeTruthy();
          expect(error.status).toEqual(401);
          expect(sessionStorage.setItem).toHaveBeenCalledWith(
            'requestError',
            JSON.stringify({
              data: error
            })
          );
          expect(RouterMock.navigateByUrl).toHaveBeenCalledWith(
            '/requestError'
          );
        }
      );
      const request = httpClientMock.expectOne('/api');

      // when
      request.flush(
        {},
        {
          status: 401,
          statusText: 'Unauthorized'
        }
      );
    });

    it('old token clears sessionStorage, triggers implicit flow and navigates to /', () => {
      spyOn(Date, 'now').and.callFake(() => {
        return currDate;
      });
      sessionStorage.setItem('id_token_stored_at', olderToken.toString());

      // given
      http.get('/api').subscribe(
        response => {},
        error => {
          // then
          expect(error).toBeTruthy();
          expect(error.status).toEqual(401);
          expect(sessionStorage.clear).toHaveBeenCalled();
          expect(RouterMock.navigateByUrl).toHaveBeenCalledWith('/');
        }
      );
      const request = httpClientMock.expectOne('/api');

      // when
      request.flush(
        {},
        {
          status: 401,
          statusText: 'Unauthorized'
        }
      );
    });
  });
  afterEach(() => {
    httpClientMock.verify();
  });
});
