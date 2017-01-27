import Bunyan from 'bunyan';
import Base from './base';

const base = new Base();

const logger = Bunyan.createLogger({
  name: 'Base',
});

logger.info('The current date is: %s', base.date);
