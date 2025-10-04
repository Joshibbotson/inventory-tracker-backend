import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { RequireVerified } from 'src/core/decorators/require-verified.decorator';

@RequireVerified()
@Controller('quotes')
export class QuotesController {
  @Get('today')
  async getQuoteOfTheDay() {
    try {
      const response = await fetch('https://zenquotes.io/api/today');
      if (!response.ok) {
        throw new HttpException(
          'Failed to fetch quote',
          HttpStatus.BAD_GATEWAY,
        );
      }

      const data = await response.json();
      // ZenQuotes returns an array with a single object
      const quote = data[0];

      return {
        quote: quote.q,
        author: quote.a,
      };
    } catch (error) {
      console.error(error);
      throw new HttpException(
        'Error fetching quote',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
