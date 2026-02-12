declare module "express" {
  export interface Request {
    body?: any;
    params?: any;
    query?: any;
  }
  export interface Response {
    status(code: number): Response;
    json(data: any): Response;
  }
  export type NextFunction = () => void;
}